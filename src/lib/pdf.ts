// PDF 첫 페이지를 PNG 로 렌더링한다.
// 서버에 설치된 도구 순서대로 시도하고, 모두 없으면 null 을 돌려 안전 폴백한다.
//  1) sharp 의 PDF 입력(빌드에 pdfium/poppler 가 포함된 경우)
//  2) pdftoppm (poppler-utils)
//  3) python3 + PyMuPDF(fitz)
//  4) python3 + pypdfium2
//  5) gs (Ghostscript)

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type PdfRenderResult = {
  png: Buffer;
  renderer: string;
  pageCount: number | null;
  pageWidth: number | null;
  pageHeight: number | null;
};

const PY_MUPDF = `
import sys
import pymupdf
doc = pymupdf.open(sys.argv[1])
page = doc[0]
pix = page.get_pixmap(dpi=int(sys.argv[3]), alpha=False)
pix.save(sys.argv[2])
print("PAGES=%d" % doc.page_count)
print("SIZE=%dx%d" % (page.rect.width, page.rect.height))
`;

const PY_PDFIUM = `
import sys
import pypdfium2 as pdfium
pdf = pdfium.PdfDocument(sys.argv[1])
page = pdf[0]
scale = float(sys.argv[3]) / 72.0
bitmap = page.render(scale=scale)
image = bitmap.to_pil()
image.convert("RGB").save(sys.argv[2])
print("PAGES=%d" % len(pdf))
print("SIZE=%dx%d" % (page.get_size()[0], page.get_size()[1]))
`;

function parseMeta(stdout: string): { pageCount: number | null; pageWidth: number | null; pageHeight: number | null } {
  const pages = stdout.match(/PAGES=(\d+)/);
  const size = stdout.match(/SIZE=([\d.]+)x([\d.]+)/);
  return {
    pageCount: pages ? Number(pages[1]) : null,
    pageWidth: size ? Math.round(Number(size[1])) : null,
    pageHeight: size ? Math.round(Number(size[2])) : null,
  };
}

async function trySharp(buffer: Buffer): Promise<Buffer | null> {
  try {
    const sharpModule = (await import("sharp")).default;
    return await sharpModule(buffer, { failOn: "none", density: 144 }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function renderPdfFirstPage(buffer: Buffer, dpi = 150): Promise<PdfRenderResult | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eum-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");
  const pngPath = path.join(dir, "page-1.png");
  try {
    await writeFile(pdfPath, buffer);

    const sharpPng = await trySharp(buffer);
    if (sharpPng && sharpPng.length > 0) {
      const meta = await pdfPlainMeta(buffer);
      return { png: sharpPng, renderer: "sharp(pdfium)", pageCount: meta.pageCount, pageWidth: null, pageHeight: null };
    }

    // pdftoppm (poppler-utils)
    try {
      await run("pdftoppm", ["-f", "1", "-l", "1", "-r", String(dpi), "-png", "-singlefile", pdfPath, path.join(dir, "page")], {
        timeout: 45000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const png = await readFile(`${path.join(dir, "page")}.png`);
      const meta = await pdfPlainMeta(buffer);
      const size = await pngSize(png);
      return { png, renderer: "pdftoppm", pageCount: meta.pageCount, pageWidth: size?.width ?? null, pageHeight: size?.height ?? null };
    } catch {
      /* 다음 렌더러 시도 */
    }

    // python3 + PyMuPDF
    try {
      const { stdout } = await run("python3", ["-c", PY_MUPDF, pdfPath, pngPath, String(dpi)], {
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const png = await readFile(pngPath);
      const meta = parseMeta(stdout);
      return { png, renderer: "python3/pymupdf", ...meta };
    } catch {
      /* 다음 렌더러 시도 */
    }

    // python3 + pypdfium2
    try {
      const { stdout } = await run("python3", ["-c", PY_PDFIUM, pdfPath, pngPath, String(dpi)], {
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const png = await readFile(pngPath);
      const meta = parseMeta(stdout);
      return { png, renderer: "python3/pypdfium2", ...meta };
    } catch {
      /* 다음 렌더러 시도 */
    }

    // Ghostscript
    try {
      await run(
        "gs",
        ["-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=png16m", `-r${dpi}`, "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${pngPath}`, pdfPath],
        { timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
      );
      const png = await readFile(pngPath);
      const meta = await pdfPlainMeta(buffer);
      const size = await pngSize(png);
      return { png, renderer: "ghostscript", pageCount: meta.pageCount, pageWidth: size?.width ?? null, pageHeight: size?.height ?? null };
    } catch {
      return null;
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

/** 렌더러 없이 PDF 구조에서 페이지 수·암호화 여부만 읽는다. */
async function pdfPlainMeta(buffer: Buffer): Promise<{ pageCount: number | null }> {
  const text = buffer.toString("latin1");
  const countMatch = text.match(/\/Count\s+(\d+)/);
  const typeMatches = text.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = typeMatches ? typeMatches.length : countMatch ? Number(countMatch[1]) : null;
  return { pageCount };
}

async function pngSize(png: Buffer): Promise<{ width: number; height: number } | null> {
  if (png.length < 24) return null;
  if (png.toString("latin1", 1, 4) !== "PNG") return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** 서버에 실제로 쓸 수 있는 PDF 렌더러가 있는지 확인한다(안내·테스트용). */
export async function detectPdfRenderer(): Promise<string | null> {
  const probe = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "latin1",
  );
  const result = await renderPdfFirstPage(probe, 72).catch(() => null);
  return result?.renderer ?? null;
}
