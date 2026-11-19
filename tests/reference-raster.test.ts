import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { attachUpload, makeClient, makeProject, makeUser, resetDb } from "./helpers";
import { initializeStorage } from "./utils";
import { decodeGlb, encodeGlb, meshStats, optimizeMeshes, texturedBoxGeom } from "@/lib/glb";
import { buildRasterReference } from "@/lib/reference";
import { decodeRaster } from "@/lib/raster";
import { readStored, storedExists } from "@/lib/storage";
import { detectPdfRenderer } from "@/lib/pdf";

// 도면 A: 흰 배경 + 검은 외곽/원/중심선/문자 (일반 기계 도면)
const DRAWING_A = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect width="800" height="600" fill="#ffffff"/>
  <rect x="60" y="60" width="680" height="480" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="400" cy="300" r="140" fill="none" stroke="#000000" stroke-width="5"/>
  <circle cx="400" cy="300" r="46" fill="none" stroke="#000000" stroke-width="4"/>
  <line x1="60" y1="300" x2="740" y2="300" stroke="#000000" stroke-width="2" stroke-dasharray="12 8"/>
  <text x="90" y="120" font-size="34" fill="#000000">EUM-A101</text>
</svg>`;

// 도면 B: 어두운 배경 + 밝은 선, 전혀 다른 레이아웃 (배경/잉크 극성도 다름)
const DRAWING_B = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <rect width="600" height="900" fill="#0b1220"/>
  <g stroke="#d9e6f5" stroke-width="4" fill="none">
    <rect x="40" y="40" width="520" height="200"/>
    <rect x="40" y="300" width="240" height="240"/>
    <rect x="320" y="300" width="240" height="240"/>
    <path d="M40 620 H560 M40 700 H560 M40 780 H420"/>
  </g>
</svg>`;

async function renderPng(svg: string, format: "png" | "jpeg" = "png"): Promise<Buffer> {
  const image = sharp(Buffer.from(svg));
  return format === "png" ? image.png().toBuffer() : image.jpeg({ quality: 92 }).toBuffer();
}

function glbJson(glb: Buffer): { images?: { bufferView: number; mimeType: string }[]; meshes?: { primitives: { attributes: Record<string, number> }[] }[]; textures?: unknown[] } {
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  while (offset + 8 <= glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) json = JSON.parse(glb.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB JSON 청크가 없습니다.");
  return json as ReturnType<typeof glbJson>;
}

async function createProjectWithFile(filename: string, buffer: Buffer) {
  const client = await makeClient();
  const user = await makeUser(client.id);
  const project = await makeProject(client.id, user.id, { industry: "MANUFACTURING" });
  await attachUpload(project.id, filename, buffer);
  return project;
}

async function loadResult(projectId: string) {
  const saved = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const parts = await prisma.part.findMany({ where: { projectId }, orderBy: { order: "asc" } });
  const model = await readStored(saved.modelPath!);
  return { saved, parts, model, json: glbJson(model), stats: meshStats(decodeGlb(model).meshes) };
}

describe("2D 이미지·PDF 도면의 고유 3D 시각화", () => {
  beforeEach(async () => {
    await resetDb();
    await initializeStorage();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("서로 다른 PNG 는 서로 다른 릴리프·텍스처·부품·썸네일을 만든다", async () => {
    const pngA = await renderPng(DRAWING_A);
    const pngB = await renderPng(DRAWING_B);
    const projectA = await createProjectWithFile("drawing-a.png", pngA);
    const projectB = await createProjectWithFile("drawing-b.png", pngB);

    const outcomeA = await runPipeline(projectA.id);
    const outcomeB = await runPipeline(projectB.id);
    expect(outcomeA.status).toBe("OK");
    expect(outcomeB.status).toBe("OK");

    const a = await loadResult(projectA.id);
    const b = await loadResult(projectB.id);

    // 1) 원본 이미지가 실제 GLB 정점/메시로 반영되어 서로 다르다
    expect(a.stats.vertexCount).toBeGreaterThan(100);
    expect(a.stats.vertexCount).not.toBe(b.stats.vertexCount);
    expect(a.stats.vertexCount).toBeLessThan(2_000_000);
    expect(a.stats.size.map((v) => Number(v.toFixed(3)))).not.toEqual(b.stats.size.map((v) => Number(v.toFixed(3))));
    expect(a.json.meshes!.length).not.toBe(b.json.meshes!.length);

    // 2) 업로드한 원본 이미지가 정면 텍스처(UV)로 GLB 에 내장된다
    for (const result of [a, b]) {
      expect(result.json.images?.length).toBe(1);
      expect(result.json.textures?.length).toBe(1);
      const textured = result.json.meshes!.filter((m) => m.primitives[0].attributes.TEXCOORD_0 !== undefined);
      expect(textured.length).toBe(1);
      expect(result.saved.referenceImageUrl).toContain("/reference-page-1.png?v=");
    }

    // 3) 이미지마다 다른 부품 계층·바운딩 박스
    const namesA = a.parts.map((p) => p.name);
    const namesB = b.parts.map((p) => p.name);
    expect(namesA).toContain("도면 원본 블록");
    expect(namesA.some((n) => n.includes("주 윤곽"))).toBe(true);
    expect(namesB.some((n) => n.includes("주 윤곽"))).toBe(true);
    expect(namesA.join("|")).not.toBe(namesB.join("|"));
    expect(a.parts.length).not.toBe(b.parts.length);
    const boxA = [a.saved.stats, b.saved.stats].map((s) => JSON.parse(s!).bbox);
    expect(boxA[0]).not.toEqual(boxA[1]);

    // 4) 분석 지문·불확실성 고지 유지
    const analysisA = JSON.parse(a.saved.aiAnalysis);
    const analysisB = JSON.parse(b.saved.aiAnalysis);
    expect(analysisA.signature).toBeTruthy();
    expect(analysisA.signature).not.toBe(analysisB.signature);
    expect(analysisA.note).toContain("참고용");
    expect(analysisA.uncertainties.join(" ")).toContain("깊이");
    expect(analysisA.headline).not.toBe(analysisB.headline);
    expect(a.saved.isAiReference).toBe(true);
    expect(a.saved.renderMode).toBe("AI_REFERENCE_3D");

    // 5) 참고 이미지 파일이 실제로 저장되어 있고 PNG 이다
    for (const result of [a, b]) {
      const relative = result.saved.referenceImageUrl!.replace(/^\/api\/files\//, "").split("?")[0];
      expect(await storedExists(relative)).toBe(true);
      const png = await readStored(relative);
      expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    }

    // 6) 썸네일도 원본 미리보기 + 지문으로 서로 다르다
    const thumbA = await readStored(a.saved.thumbnailPath!);
    const thumbB = await readStored(b.saved.thumbnailPath!);
    expect(thumbA.equals(thumbB)).toBe(false);
    expect(thumbA.toString("utf8")).toContain("data:image/jpeg;base64,");
    expect(thumbB.toString("utf8")).toContain("data:image/jpeg;base64,");
  });

  it("같은 PNG 는 같은 형상 지문과 부품 구성을 만든다", async () => {
    const png = await renderPng(DRAWING_A);
    const first = await createProjectWithFile("repeat-a.png", png);
    const second = await createProjectWithFile("repeat-a.png", png);
    await runPipeline(first.id);
    await runPipeline(second.id);
    const a = await loadResult(first.id);
    const b = await loadResult(second.id);
    const analysisA = JSON.parse(a.saved.aiAnalysis);
    const analysisB = JSON.parse(b.saved.aiAnalysis);
    expect(analysisA.signature).toBe(analysisB.signature);
    expect(a.parts.map((p) => p.name)).toEqual(b.parts.map((p) => p.name));
    expect(a.stats.vertexCount).toBe(b.stats.vertexCount);
  });

  it("JPG · TIFF 도 같은 이미지 기반 3D 파이프라인을 탄다", async () => {
    const jpg = await renderPng(DRAWING_A, "jpeg");
    const tiff = await sharp(Buffer.from(DRAWING_B)).tiff().toBuffer();
    const projectJpg = await createProjectWithFile("drawing-a.jpg", jpg);
    const projectTiff = await createProjectWithFile("drawing-b.tiff", tiff);
    const outcomeJpg = await runPipeline(projectJpg.id);
    const outcomeTiff = await runPipeline(projectTiff.id);
    expect(outcomeJpg.status).toBe("OK");
    expect(outcomeTiff.status).toBe("OK");
    const jpgResult = await loadResult(projectJpg.id);
    const tiffResult = await loadResult(projectTiff.id);
    expect(jpgResult.saved.renderMode).toBe("AI_REFERENCE_3D");
    expect(tiffResult.saved.renderMode).toBe("AI_REFERENCE_3D");
    expect(jpgResult.json.images?.length).toBe(1);
    expect(tiffResult.json.images?.length).toBe(1);
    expect(jpgResult.parts.map((p) => p.name)).not.toEqual(tiffResult.parts.map((p) => p.name));
  });

  it("이미지가 깨져 있으면 형식 검사에서 실패로 끝나고 임의 형상을 만들지 않는다", async () => {
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    const client = await makeClient();
    const user = await makeUser(client.id);
    const project = await makeProject(client.id, user.id, { industry: "MANUFACTURING" });
    // 형식 검사는 통과하지만 디코딩이 실패하는 경우 → 파이프라인 실패, GLB/부품 없음
    const storedPath = await import("@/lib/storage").then((m) => m.saveProjectSource(project.id, "broken.png", broken));
    await prisma.upload.create({
      data: {
        projectId: project.id,
        originalName: "broken.png",
        storedPath,
        size: broken.length,
        sha256: createHash("sha256").update(broken).digest("hex"),
        detectedFormat: "PNG",
        declaredExt: "png",
        kind: "2D",
        integrity: "OK",
        meta: JSON.stringify({ width: 0, height: 0 }),
      },
    });
    const outcome = await runPipeline(project.id);
    expect(outcome.status).toBe("FAILED");
    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(saved.modelPath).toBeNull();
    const parts = await prisma.part.count({ where: { projectId: project.id } });
    expect(parts).toBe(0);
  });

  it("PDF 첫 페이지를 렌더링해 이미지 기반 3D 로 만들고, PDF 마다 결과가 다르다", async () => {
    const renderer = await detectPdfRenderer();
    const pdfA = readFileSync(path.join(process.cwd(), "tests/fixtures/drawing-a.pdf"));
    const pdfB = readFileSync(path.join(process.cwd(), "tests/fixtures/drawing-b.pdf"));
    const projectA = await createProjectWithFile("drawing-a.pdf", pdfA);
    const projectB = await createProjectWithFile("drawing-b.pdf", pdfB);
    const outcomeA = await runPipeline(projectA.id);
    const outcomeB = await runPipeline(projectB.id);

    if (!renderer) {
      // PDF 렌더러가 없는 서버: 원본 패널 폴백 + 명확한 안내, 3D 형상은 만들지 않음
      expect(outcomeA.status).toBe("WARN");
      const saved = await prisma.project.findUniqueOrThrow({ where: { id: projectA.id } });
      expect(saved.referenceImageUrl).toBeNull();
      const analysis = JSON.parse(saved.aiAnalysis);
      expect(analysis.uncertainties.join(" ")).toContain("PDF 렌더러");
      return;
    }

    expect(outcomeA.status).toBe("OK");
    expect(outcomeB.status).toBe("OK");
    const a = await loadResult(projectA.id);
    const b = await loadResult(projectB.id);
    expect(a.saved.renderMode).toBe("AI_REFERENCE_3D");
    expect(a.saved.referenceImageUrl).toContain("/reference-page-1.png?v=");
    expect(a.json.images?.length).toBe(1);
    expect(a.stats.vertexCount).not.toBe(b.stats.vertexCount);
    const analysisA = JSON.parse(a.saved.aiAnalysis);
    expect(analysisA.uncertainties.join(" ")).toContain("깊이");
    expect(analysisA.signature).not.toBe(JSON.parse(b.saved.aiAnalysis).signature);
  });
});

describe("텍스처·UV 유틸", () => {
  it("정면(+Z) 면의 UV 가 이미지 좌상단 기준으로 1:1 매핑된다", () => {
    const geom = texturedBoxGeom([2, 1, 0.1], [0, 0, 0]);
    const uvs = geom.uvs!;
    expect(uvs.length).toBe((geom.positions.length / 3) * 2);
    const corners: { x: number; y: number; u: number; v: number }[] = [];
    for (let i = 0; i < geom.positions.length; i += 3) {
      if (Math.abs(geom.positions[i + 2] - 0.05) < 1e-6) {
        corners.push({ x: geom.positions[i], y: geom.positions[i + 1], u: uvs[(i / 3) * 2], v: uvs[(i / 3) * 2 + 1] });
      }
    }
    expect(corners.length).toBeGreaterThanOrEqual(4);
    const bottomLeft = corners.find((c) => c.x < 0 && c.y < 0)!;
    const topLeft = corners.find((c) => c.x < 0 && c.y > 0)!;
    const topRight = corners.find((c) => c.x > 0 && c.y > 0)!;
    const bottomRight = corners.find((c) => c.x > 0 && c.y < 0)!;
    expect([bottomLeft.u, bottomLeft.v]).toEqual([0, 1]);
    expect([topLeft.u, topLeft.v]).toEqual([0, 0]);
    expect([topRight.u, topRight.v]).toEqual([1, 0]);
    expect([bottomRight.u, bottomRight.v]).toEqual([1, 1]);
  });

  it("최적화 후에도 UV 개수가 정점 개수와 일치한다", () => {
    const geom = texturedBoxGeom([1, 1, 0.2]);
    const mesh = {
      name: "T",
      positions: geom.positions,
      normals: geom.normals,
      indices: geom.indices,
      uvs: geom.uvs,
      texture: { data: Buffer.from([1, 2, 3]), mimeType: "image/png" },
    };
    const glb = encodeGlb([mesh]);
    const glbJsonParsed = glbJson(glb);
    expect(glbJsonParsed.images?.length).toBe(1);
    const optimized = optimizeMeshes([mesh]);
    expect(optimized.meshes[0].uvs!.length).toBe((optimized.meshes[0].positions.length / 3) * 2);
    expect(optimized.meshes[0].texture).toBeDefined();
    expect(decodeGlb(glb).meshes.length).toBe(1);
  });

  it("래스터 분석은 이미지마다 다른 지문과 잉크 비율을 낸다", async () => {
    const a = await decodeRaster(await renderPng(DRAWING_A), 192);
    const b = await decodeRaster(await renderPng(DRAWING_B), 192);
    expect(a.signature).not.toBe(b.signature);
    expect(a.inkRatio).not.toBeCloseTo(b.inkRatio, 4);
    expect(a.darkInk).toBe(true);
    expect(b.darkInk).toBe(false);
    const built = buildRasterReference({ filename: "a.png", formatLabel: "PNG", image: a, texture: await renderPng(DRAWING_A) });
    expect(built.meshes.some((m) => m.name === "DRAWING_BLOCK" && m.texture)).toBe(true);
    expect(built.analysis.note).toContain("참고용");
  });
});
