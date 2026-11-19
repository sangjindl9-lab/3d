import { createHash } from "node:crypto";

export type FileKind = "2D" | "3D" | "UNKNOWN";
export type ConverterKind = "BUILT_IN" | "EXTERNAL_REQUIRED" | "NONE";

export type FormatDefinition = {
  id: string;
  label: string;
  extensions: string[];
  kind: FileKind;
  category: "MESH" | "CAD3D" | "VECTOR2D" | "RASTER2D" | "DOC";
  converter: ConverterKind;
  note?: string;
  mime: string;
};

/**
 * 지원 형식 정의.
 * BUILT_IN = 서버에서 실제 메시 파싱/GLB 생성까지 수행
 * EXTERNAL_REQUIRED = 형식·메타 분석만 수행하고 표준 GLB 변환은 외부 변환기/공식 API 필요
 */
export const FORMATS: FormatDefinition[] = [
  { id: "GLB", label: "GLB (glTF 2.0 바이너리)", extensions: ["glb"], kind: "3D", category: "MESH", converter: "BUILT_IN", mime: "model/gltf-binary" },
  { id: "GLTF", label: "glTF 2.0", extensions: ["gltf"], kind: "3D", category: "MESH", converter: "BUILT_IN", mime: "model/gltf+json" },
  { id: "STL", label: "STL (스테레오리소그래피)", extensions: ["stl"], kind: "3D", category: "MESH", converter: "BUILT_IN", mime: "model/stl" },
  { id: "OBJ", label: "OBJ (Wavefront)", extensions: ["obj"], kind: "3D", category: "MESH", converter: "BUILT_IN", mime: "model/obj" },
  { id: "3MF", label: "3MF (3D Manufacturing)", extensions: ["3mf"], kind: "3D", category: "MESH", converter: "EXTERNAL_REQUIRED", note: "ZIP 기반 패키지 — 메타 분석 후 표준 GLB 변환 안내", mime: "model/3mf" },
  { id: "STEP", label: "STEP (AP203/AP214)", extensions: ["step", "stp"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "B-Rep 커널 변환기 필요", mime: "model/step" },
  { id: "IGES", label: "IGES", extensions: ["iges", "igs"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "B-Rep 커널 변환기 필요", mime: "model/iges" },
  { id: "FBX", label: "FBX (Autodesk)", extensions: ["fbx"], kind: "3D", category: "MESH", converter: "EXTERNAL_REQUIRED", note: "FBX SDK/변환기 필요", mime: "application/octet-stream" },
  { id: "IFC", label: "IFC (BIM)", extensions: ["ifc"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "IFC 엔티티 분석 후 GLB 변환 안내", mime: "model/ifc" },
  { id: "DXF", label: "DXF (2D 도면 교환)", extensions: ["dxf"], kind: "2D", category: "VECTOR2D", converter: "BUILT_IN", note: "텍스트 엔티티 파싱 → 참고용 3D 시각화", mime: "image/vnd.dxf" },
  { id: "DWG", label: "DWG (AutoCAD)", extensions: ["dwg"], kind: "2D", category: "VECTOR2D", converter: "EXTERNAL_REQUIRED", note: "바이너리 DWG — DXF 변환 후 시각화", mime: "image/vnd.dwg" },
  { id: "PDF", label: "PDF 도면", extensions: ["pdf"], kind: "2D", category: "DOC", converter: "BUILT_IN", note: "첫 페이지 PNG 렌더 → 이미지 윤곽 기반 참고용 3D 릴리프", mime: "application/pdf" },
  { id: "PNG", label: "PNG 이미지", extensions: ["png"], kind: "2D", category: "RASTER2D", converter: "BUILT_IN", note: "이미지 윤곽·밝기 분석 → 원본 텍스처 + 참고용 3D 릴리프", mime: "image/png" },
  { id: "JPG", label: "JPEG 이미지", extensions: ["jpg", "jpeg"], kind: "2D", category: "RASTER2D", converter: "BUILT_IN", note: "이미지 윤곽·밝기 분석 → 원본 텍스처 + 참고용 3D 릴리프", mime: "image/jpeg" },
  { id: "TIFF", label: "TIFF 이미지", extensions: ["tif", "tiff"], kind: "2D", category: "RASTER2D", converter: "BUILT_IN", note: "이미지 윤곽·밝기 분석 → 원본 텍스처 + 참고용 3D 릴리프", mime: "image/tiff" },
  { id: "SOLIDWORKS", label: "SolidWorks 파트/어셈블리", extensions: ["sldprt", "sldasm"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — STEP 또는 GLB 로 변환 업로드", mime: "application/octet-stream" },
  { id: "INVENTOR", label: "Autodesk Inventor", extensions: ["ipt", "iam"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — STEP 또는 GLB 로 변환 업로드", mime: "application/octet-stream" },
  { id: "CATIA", label: "CATIA", extensions: ["catpart", "catproduct"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — STEP 또는 GLB 로 변환 업로드", mime: "application/octet-stream" },
  { id: "NX", label: "Siemens NX", extensions: ["prt"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — STEP 또는 GLB 로 변환 업로드", mime: "application/octet-stream" },
  { id: "CREO", label: "PTC Creo", extensions: ["prt", "asm"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — STEP 또는 GLB 로 변환 업로드", mime: "application/octet-stream" },
  { id: "SKETCHUP", label: "SketchUp", extensions: ["skp"], kind: "3D", category: "CAD3D", converter: "EXTERNAL_REQUIRED", note: "공식 API/변환기 미연동 — GLB 로 변환 업로드", mime: "application/octet-stream" },
];

export const MESH_FORMATS = ["GLB", "GLTF", "STL", "OBJ"];
export const DRAWING_FORMATS = ["DXF", "DWG", "PDF", "PNG", "JPG", "TIFF"];
export const EXTERNAL_FORMATS = FORMATS.filter((f) => f.converter === "EXTERNAL_REQUIRED").map((f) => f.id);

export function formatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

function ascii(buffer: Buffer, start = 0, end = 256): string {
  return buffer.subarray(start, Math.min(end, buffer.length)).toString("latin1");
}

function hasBinaryNul(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 512);
  for (let i = 0; i < limit; i++) if (buffer[i] === 0) return true;
  return false;
}

function u32be(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

function detectByMagic(buffer: Buffer, filename: string): { id: string; confidence: number; magic: string } | null {
  const head = ascii(buffer, 0, 64);
  const size = buffer.length;
  if (size >= 4 && buffer.subarray(0, 4).toString("latin1") === "glTF") {
    return { id: "GLB", confidence: 0.99, magic: "glTF" };
  }
  if (size >= 12 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return { id: "PNG", confidence: 0.99, magic: "png" };
  }
  if (size >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { id: "JPG", confidence: 0.99, magic: "jpeg" };
  }
  if (size >= 4) {
    const le = buffer.readUInt32BE(0) === 0x49492a00 || buffer.readUInt32BE(0) === 0x4d4d002a;
    if (le) return { id: "TIFF", confidence: 0.98, magic: "tiff" };
  }
  if (head.startsWith("%PDF-")) return { id: "PDF", confidence: 0.99, magic: "pdf" };
  if (size >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const text = buffer.subarray(0, Math.min(size, 4096)).toString("latin1");
    const nested = buffer.includes("3dmodel.model") || text.includes("3D/3dmodel.model");
    return { id: nested ? "3MF" : "ZIP", confidence: nested ? 0.95 : 0.5, magic: "zip" };
  }
  if (head.startsWith("AC10") && /^AC10\d\d/.test(head)) {
    return { id: "DWG", confidence: 0.97, magic: head.slice(0, 6) };
  }
  if (head.startsWith("Kaydara FBX Binary")) return { id: "FBX", confidence: 0.99, magic: "fbx-binary" };
  if (head.startsWith("; FBX") || head.includes("FBXHeaderExtension")) {
    return { id: "FBX", confidence: 0.9, magic: "fbx-ascii" };
  }
  if (head.startsWith("ISO-10303-21")) {
    const text = buffer.subarray(0, Math.min(size, 8192)).toString("latin1");
    if (/FILE_SCHEMA\s*\(\s*\(\s*'[^']*IFC/i.test(text) || buffer.includes("IFC")) {
      return { id: "IFC", confidence: 0.96, magic: "iso-10303-21/ifc" };
    }
    return { id: "STEP", confidence: 0.96, magic: "iso-10303-21" };
  }
  // STL binary: 84 + n*50 바이트 정확히 일치
  if (size >= 84) {
    const triangles = buffer.readUInt32LE(80);
    if (triangles > 0 && 84 + triangles * 50 === size) {
      return { id: "STL", confidence: 0.97, magic: "stl-binary" };
    }
  }
  const textHead = ascii(buffer, 0, 2048);
  if (/^\s*solid\s+\S/.test(textHead) && /facet\s+normal/i.test(textHead)) {
    return { id: "STL", confidence: 0.9, magic: "stl-ascii" };
  }
  if (/^\s*0\s*\r?\n\s*SECTION\b/i.test(textHead) || (textHead.includes("SECTION") && textHead.includes("ENTITIES"))) {
    return { id: "DXF", confidence: 0.92, magic: "dxf-text" };
  }
  // IGES: 각 줄 73번째 컬럼이 섹션 문자
  if (size > 80) {
    const lines = ascii(buffer, 0, 400).split(/\r?\n/).filter(Boolean);
    const sectionLetters = lines.slice(0, 4).map((l) => l[72] ?? "");
    if (sectionLetters.every((c) => "SGDPT".includes(c) || c === "") && textHead.includes("1H,")) {
      return { id: "IGES", confidence: 0.9, magic: "iges" };
    }
  }
  if (textHead.trimStart().startsWith("{") && /"asset"\s*:/.test(textHead)) {
    return { id: "GLTF", confidence: 0.95, magic: "gltf-json" };
  }
  if (/^\s*(v\s+-?\d|#.*Wavefront|mtllib\s)/m.test(textHead) && /^\s*f\s+/m.test(ascii(buffer, 0, Math.min(size, 200000)))) {
    return { id: "OBJ", confidence: 0.9, magic: "obj-text" };
  }
  return null;
}

export type DetectionResult = {
  formatId: string;
  formatLabel: string;
  kind: FileKind;
  category: string;
  converter: ConverterKind;
  declaredExt: string;
  extensionMatches: boolean;
  confidence: number;
  integrity: "OK" | "WARNING" | "FAILED";
  issues: string[];
  meta: Record<string, unknown>;
  size: number;
  sha256: string;
  binary: boolean;
};

function imageMeta(buffer: Buffer, formatId: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  try {
    if (formatId === "PNG" && buffer.length >= 24) {
      meta.width = u32be(buffer, 16);
      meta.height = u32be(buffer, 20);
    } else if (formatId === "JPG") {
      let i = 2;
      while (i < buffer.length - 9) {
        if (buffer[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buffer[i + 1];
        const len = buffer.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          meta.height = buffer.readUInt16BE(i + 5);
          meta.width = buffer.readUInt16BE(i + 7);
          break;
        }
        i += 2 + len;
      }
    } else if (formatId === "TIFF" && buffer.length >= 8) {
      const little = buffer[0] === 0x49;
      const read16 = (o: number) => (little ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o));
      const read32 = (o: number) => (little ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o));
      const ifd = read32(4);
      const count = read16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > buffer.length) break;
        const tag = read16(entry);
        const type = read16(entry + 2);
        const value = type === 3 ? read16(entry + 8) : read32(entry + 8);
        if (tag === 256) meta.width = value;
        if (tag === 257) meta.height = value;
      }
      meta.endian = little ? "little" : "big";
    }
  } catch {
    meta.note = "이미지 헤더 일부를 해석하지 못했습니다.";
  }
  return meta;
}

function pdfMeta(buffer: Buffer): Record<string, unknown> {
  const text = buffer.toString("latin1");
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
  const countMatch = text.match(/\/Count\s+(\d+)/);
  return {
    pageCount: pageMatches ? pageMatches.length : countMatch ? Number(countMatch[1]) : null,
    encrypted: /\/Encrypt\b/.test(text),
    producer: (text.match(/\/Producer\s*\(([^)]{0,120})\)/) ?? [])[1] ?? null,
    version: (text.match(/%PDF-(\d\.\d)/) ?? [])[1] ?? null,
  };
}

function dxfMeta(buffer: Buffer): Record<string, unknown> {
  const text = buffer.toString("latin1");
  const labels = ["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "TEXT", "MTEXT", "INSERT", "SPLINE", "DIMENSION"];
  const counts: Record<string, number> = {};
  for (const label of labels) {
    const re = new RegExp(`\\n\\s*${label}\\s*\\r?\\n`, "g");
    const c = (text.match(re) ?? []).length;
    if (c > 0) counts[label] = c;
  }
  const layers = Array.from(new Set(Array.from(text.matchAll(/\nLAYER\n\s*\r?\n([^\r\n]+)/g)).map((m) => m[1].trim())));
  const header = text.match(/\$EXTMIN[\s\S]{0,120}/);
  return { entityCounts: counts, layerNames: layers.slice(0, 40), headerSample: header ? header[0].slice(0, 80) : null };
}

function stepMeta(buffer: Buffer): Record<string, unknown> {
  const text = buffer.toString("latin1");
  const entities = (text.match(/;\s*\n/g) ?? []).length;
  const schema = (text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/) ?? [])[1] ?? null;
  const products = Array.from(new Set(Array.from(text.matchAll(/PRODUCT\s*\(\s*'([^']+)'/g)).map((m) => m[1]))).slice(0, 20);
  return { entities, schema, products };
}

function fbxMeta(buffer: Buffer): Record<string, unknown> {
  const head = ascii(buffer, 0, 64);
  const binary = head.startsWith("Kaydara FBX Binary");
  const text = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("latin1");
  const version = (text.match(/FBXVersion[\s\S]{0,40}?(\d{4,5})/) ?? [])[1];
  return { binary, version: version ?? null };
}

export function analyzeFile(buffer: Buffer, filename: string): DetectionResult {
  const declaredExt = extensionOf(filename);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const size = buffer.length;
  const issues: string[] = [];
  let confidence = 0;
  const detected = detectByMagic(buffer, filename);
  const byExt = FORMATS.find((f) => f.extensions.includes(declaredExt));

  let formatId = "UNKNOWN";
  let magic = "unknown";
  if (detected) {
    formatId = detected.id;
    confidence = detected.confidence;
    magic = detected.magic;
  } else if (byExt) {
    formatId = byExt.id;
    confidence = 0.55;
    magic = "extension-only";
    issues.push("매직 바이트로 형식을 확인하지 못해 확장자만으로 판별했습니다.");
  }

  const format = formatById(formatId);
  let integrity: "OK" | "WARNING" | "FAILED" = "OK";
  if (size === 0) {
    integrity = "FAILED";
    issues.push("빈 파일입니다.");
  } else if (size < 16 && formatId !== "UNKNOWN") {
    integrity = "WARNING";
    issues.push("파일 크기가 비정상적으로 작습니다.");
  }

  let extensionMatches = true;
  if (format && declaredExt && !format.extensions.includes(declaredExt)) {
    extensionMatches = false;
    if (detected && detected.confidence >= 0.85) {
      issues.push(`확장자(.${declaredExt})와 실제 형식(${format.id})이 다릅니다. 실제 형식 기준으로 처리합니다.`);
      if (integrity === "OK") integrity = "WARNING";
    }
  }
  if (!format && size > 0) {
    integrity = "FAILED";
    issues.push(`지원하지 않는 형식입니다${declaredExt ? ` (.${declaredExt})` : ""}.`);
  }
  if (formatId === "GLB" && size >= 12) {
    const declaredLength = buffer.readUInt32LE(8);
    if (declaredLength > size) {
      issues.push("GLB 헤더의 전체 길이가 실제 파일보다 큽니다(잘린 파일 가능).");
      integrity = integrity === "FAILED" ? "FAILED" : "WARNING";
    }
  }

  const binary = hasBinaryNul(buffer) || formatId === "GLB" || formatId === "STL" || magic === "fbx-binary";
  const meta: Record<string, unknown> = { magic };
  if (formatId === "PNG" || formatId === "JPG" || formatId === "TIFF") Object.assign(meta, imageMeta(buffer, formatId));
  if (formatId === "PDF") Object.assign(meta, pdfMeta(buffer));
  if (formatId === "DXF") Object.assign(meta, dxfMeta(buffer));
  if (formatId === "STEP" || formatId === "IFC") Object.assign(meta, stepMeta(buffer));
  if (formatId === "FBX") Object.assign(meta, fbxMeta(buffer));
  if (formatId === "STL" && size >= 84) {
    const tris = buffer.readUInt32LE(80);
    if (84 + tris * 50 === size) meta.triangleCount = tris;
    meta.encoding = magic === "stl-binary" ? "binary" : "ascii";
  }
  if (formatId === "DWG") meta.version = ascii(buffer, 0, 6);

  return {
    formatId,
    formatLabel: format?.label ?? "알 수 없는 형식",
    kind: format?.kind ?? "UNKNOWN",
    category: format?.category ?? "UNKNOWN",
    converter: format?.converter ?? "NONE",
    declaredExt,
    extensionMatches,
    confidence,
    integrity,
    issues,
    meta,
    size,
    sha256,
    binary,
  };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
