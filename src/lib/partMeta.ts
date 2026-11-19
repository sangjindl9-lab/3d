import { materialPreset } from "./constants";
import { partBounds, type MeshData } from "./glb";

export type PartMeta = {
  nodeName: string;
  name: string;
  description: string;
  material: string;
  spec?: string;
  weight?: number;
};

export function cleanName(raw: string): string {
  const base = raw.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
  return base.length > 0 ? base.slice(0, 40) : "부품";
}

export function guessMaterial(name: string): string {
  const l = name.toUpperCase();
  if (/HOUSING|CASE|FRAME|COVER|ENCLOSURE|외함|커버|프레임|케이스/.test(l)) return "PAINT";
  if (/PIPE|TUBE|배관|DUCT|덕트/.test(l)) return "STAINLESS";
  if (/BUSBAR|BUS BAR|COPPER|모선|부스바/.test(l)) return "COPPER";
  if (/INSULAT|절연/.test(l)) return "PLASTIC";
  if (/FAN|BLADE|팬/.test(l)) return "ALUMINUM";
  if (/GLASS|유리|METER/.test(l)) return "GLASS";
  if (/GEAR|SHAFT|BEARING|BOLT|PIN|기어|축|베어링|볼트|핀|PLATE|판/.test(l)) return "STEEL";
  return "STEEL";
}

export function guessMoldRole(name: string): string | null {
  const l = name.toUpperCase();
  if (/EJECT|이젝/.test(l)) return "EJECTOR";
  if (/SLIDE|슬라이드/.test(l)) return "SLIDE";
  if (/CAVITY|캐비티/.test(l)) return "CAVITY";
  if (/CORE|코어/.test(l)) return "CORE";
  if (/BASE|CLAMP|PLATE|고정|플레이트/.test(l)) return "BASE";
  return null;
}

export function guessMotion(name: string): string | null {
  const l = name.toUpperCase();
  if (/GEAR|기어/.test(l)) return "GEAR";
  if (/SHAFT|SPINDLE|축/.test(l)) return "SHAFT";
  if (/FAN|BLADE|팬/.test(l)) return "FAN";
  if (/MOTOR|모터/.test(l)) return "MOTOR";
  if (/PUMP|펌프|IMPELLER/.test(l)) return "PUMP";
  return null;
}

export function inferPartMeta(mesh: MeshData): PartMeta & { center: [number, number, number]; size: [number, number, number] } {
  const bounds = partBounds(mesh);
  const name = cleanName(mesh.name);
  const material = guessMaterial(name);
  const preset = materialPreset(material);
  const volume = bounds.size[0] * bounds.size[1] * bounds.size[2];
  const density = material === "ALUMINUM" ? 2700 : material === "COPPER" ? 8960 : material === "PLASTIC" ? 1200 : 7850;
  return {
    nodeName: mesh.name,
    name,
    description: `${name} — ${preset.label} 부품`,
    material,
    spec: `${(bounds.size[0] * 1000).toFixed(0)} × ${(bounds.size[1] * 1000).toFixed(0)} × ${(bounds.size[2] * 1000).toFixed(0)} mm`,
    weight: Math.max(0.01, Math.round(volume * density * 0.35 * 100) / 100),
    center: bounds.center,
    size: bounds.size,
  };
}

export function partDirection(center: [number, number, number], assemblyCenter: [number, number, number]): [number, number, number] {
  const dx = center[0] - assemblyCenter[0];
  const dy = center[1] - assemblyCenter[1];
  const dz = center[2] - assemblyCenter[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return [0, 1, 0];
  return [dx / len, dy / len, dz / len];
}
