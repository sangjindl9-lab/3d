import { describe, expect, it } from "vitest";
import { analyzeFile, extensionOf, formatById } from "@/lib/formats";
import { encodeGlb, boxGeom, makeMesh } from "@/lib/glb";

function glbBuffer(): Buffer {
  return encodeGlb([makeMesh("PART_1", [boxGeom([1, 1, 1])]), makeMesh("PART_2", [boxGeom([0.5, 0.5, 0.5], [1, 0, 0])])]);
}

function pngBuffer(): Buffer {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(640, 16);
  buf.writeUInt32BE(480, 20);
  return buf;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
}

function stlBinary(): Buffer {
  const triangles = 1;
  const buf = Buffer.alloc(84 + triangles * 50);
  buf.write("binary stl", 0, "latin1");
  buf.writeUInt32LE(triangles, 80);
  const off = 84;
  buf.writeFloatLE(1, off);
  const verts = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  verts.forEach((v, i) => buf.writeFloatLE(v, off + 12 + i * 4));
  return buf;
}

describe("파일 형식 자동 분석", () => {
  it("GLB 매직 바이트를 3D 메시로 판별한다", () => {
    const result = analyzeFile(glbBuffer(), "mold.glb");
    expect(result.formatId).toBe("GLB");
    expect(result.kind).toBe("3D");
    expect(result.integrity).toBe("OK");
    expect(result.converter).toBe("BUILT_IN");
  });

  it("PNG/JPEG 를 2D 이미지로 판별하고 크기를 읽는다", () => {
    const png = analyzeFile(pngBuffer(), "drawing.png");
    expect(png.formatId).toBe("PNG");
    expect(png.kind).toBe("2D");
    expect(png.meta.width).toBe(640);
    expect(png.meta.height).toBe(480);

    const jpg = analyzeFile(jpegBuffer(), "scan.jpg");
    expect(jpg.formatId).toBe("JPG");
    expect(jpg.meta.width).toBe(800);
    expect(jpg.meta.height).toBe(600);
  });

  it("PDF / DXF / STL / OBJ / STEP / IGES / 3MF / DWG 를 식별한다", () => {
    expect(analyzeFile(Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\n%%EOF"), "d.pdf").formatId).toBe("PDF");
    expect(analyzeFile(Buffer.from("0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nENDSEC\n0\nEOF"), "d.dxf").formatId).toBe("DXF");
    expect(analyzeFile(stlBinary(), "p.stl").formatId).toBe("STL");
    expect(analyzeFile(stlBinary(), "p.stl").meta.triangleCount).toBe(1);
    expect(analyzeFile(Buffer.from("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"), "p.obj").formatId).toBe("OBJ");
    expect(analyzeFile(Buffer.from("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nEND-ISO-10303-21;"), "p.step").formatId).toBe("STEP");
    expect(analyzeFile(Buffer.from("AC1032" + "0".repeat(100)), "plan.dwg").formatId).toBe("DWG");
    const pkg = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("3D/3dmodel.model [Content_Types].xml")]);
    expect(analyzeFile(pkg, "part.3mf").formatId).toBe("3MF");

    const igesLines = ["S      1", "G      1", "D      1", "P      1", "T      1"].map((prefix, i) => {
      const body = `${i + 1}H,EUM TEST PART`;
      return `${prefix}${" ".repeat(Math.max(0, 72 - prefix.length))}${"SGDPT"[i]}`.slice(0, 73);
    });
    const iges = analyzeFile(Buffer.from(igesLines.join("\n")), "part.igs");
    expect(iges.formatId).toBe("IGES");
  });

  it("확장자와 실제 형식이 다르면 경고를 남긴다", () => {
    const result = analyzeFile(pngBuffer(), "fake.pdf");
    expect(result.formatId).toBe("PNG");
    expect(result.extensionMatches).toBe(false);
    expect(result.integrity).toBe("WARNING");
    expect(result.issues.join(" ")).toContain("확장자");
  });

  it("빈 파일과 미지원 파일은 FAILED 로 처리한다", () => {
    expect(analyzeFile(Buffer.alloc(0), "empty.bin").integrity).toBe("FAILED");
    expect(analyzeFile(Buffer.from("hello world"), "notes.txt").integrity).toBe("FAILED");
  });

  it("외부 변환 필요 형식을 정직하게 표시한다", () => {
    const step = analyzeFile(Buffer.from("ISO-10303-21;\nHEADER;\nENDSEC;"), "assembly.stp");
    expect(step.converter).toBe("EXTERNAL_REQUIRED");
    expect(formatById(step.formatId)?.note).toContain("변환기");
  });

  it("확장자 추출 유틸", () => {
    expect(extensionOf("A.B.STEP")).toBe("step");
    expect(extensionOf("noext")).toBe("");
  });
});
