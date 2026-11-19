import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function safeSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export function safeJoin(root: string, relative: string): string | null {
  const normalized = path.posix.normalize(relative.replace(/\\/g, "/"));
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  const full = path.join(root, normalized);
  if (!full.startsWith(path.resolve(root))) return null;
  return full;
}

export async function ensureStorage(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

export async function saveProjectSource(projectId: string, originalName: string, buffer: Buffer): Promise<string> {
  const dir = path.join(STORAGE_ROOT, "projects", projectId, "source");
  await fs.mkdir(dir, { recursive: true });
  const base = safeSegment(path.basename(originalName));
  const unique = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}-${base}`;
  await fs.writeFile(path.join(dir, unique), buffer);
  return path.posix.join("projects", projectId, "source", unique);
}

export async function saveProjectArtifact(projectId: string, filename: string, buffer: Buffer | string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, "projects", projectId);
  await fs.mkdir(dir, { recursive: true });
  const name = safeSegment(filename);
  await fs.writeFile(path.join(dir, name), buffer);
  return path.posix.join("projects", projectId, name);
}

export async function saveClientLogo(clientId: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = path.join(STORAGE_ROOT, "clients", clientId);
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${safeSegment(filename)}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return path.posix.join("clients", clientId, name);
}

export async function saveThumbnail(projectId: string, data: Buffer | string, ext = "svg"): Promise<string> {
  const dir = path.join(STORAGE_ROOT, "projects", projectId);
  await fs.mkdir(dir, { recursive: true });
  const name = `thumbnail.${ext}`;
  await fs.writeFile(path.join(dir, name), data);
  return path.posix.join("projects", projectId, name);
}

export async function readStored(relativePath: string): Promise<Buffer> {
  const full = safeJoin(STORAGE_ROOT, relativePath);
  if (!full) throw new Error("잘못된 파일 경로입니다.");
  return fs.readFile(full);
}

export async function storedExists(relativePath: string): Promise<boolean> {
  const full = safeJoin(STORAGE_ROOT, relativePath);
  if (!full) return false;
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

export function fileUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return `/api/files/${relativePath.split(path.sep).join("/")}`;
}

export function mimeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
    tif: "image/tiff",
    tiff: "image/tiff",
    dxf: "image/vnd.dxf",
    dwg: "image/vnd.dwg",
    step: "model/step",
    stp: "model/step",
    stl: "model/stl",
    obj: "model/obj",
  };
  return map[ext] ?? "application/octet-stream";
}

/** 썸네일 SVG — 서버에서 즉시 생성(브라우저 없이) */
export function buildThumbnailSvg(args: {
  title: string;
  industry: string;
  subtitle: string;
  accent: string;
  badge?: string;
}): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070b12"/>
      <stop offset="0.55" stop-color="#0e1725"/>
      <stop offset="1" stop-color="${args.accent}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect width="960" height="540" fill="url(#grid)"/>
  <rect width="960" height="540" fill="url(#fade)"/>
  <text x="64" y="96" fill="#ffffff" fill-opacity="0.62" font-family="Pretendard,system-ui,sans-serif" font-size="22" letter-spacing="6">EUM 3D SHOWROOM PRO</text>
  <text x="64" y="392" fill="#ffffff" font-family="Pretendard,system-ui,sans-serif" font-size="54" font-weight="700">${esc(args.title.slice(0, 32))}</text>
  <text x="64" y="440" fill="#ffffff" fill-opacity="0.75" font-family="Pretendard,system-ui,sans-serif" font-size="26">${esc(args.subtitle.slice(0, 60))}</text>
  <rect x="64" y="470" width="${Math.max(120, args.industry.length * 22 + 48)}" height="42" rx="21" fill="${args.accent}" fill-opacity="0.18" stroke="${args.accent}" stroke-opacity="0.55"/>
  <text x="${64 + Math.max(120, args.industry.length * 22 + 48) / 2}" y="498" text-anchor="middle" fill="${args.accent}" font-family="Pretendard,system-ui,sans-serif" font-size="20">${esc(args.industry)}</text>
  ${args.badge ? `<rect x="700" y="70" width="196" height="46" rx="23" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.2"/><text x="798" y="100" text-anchor="middle" fill="#ffffff" fill-opacity="0.85" font-family="Pretendard,system-ui,sans-serif" font-size="19">${esc(args.badge)}</text>` : ""}
</svg>`;
}
