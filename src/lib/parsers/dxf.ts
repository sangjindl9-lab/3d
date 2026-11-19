// DXF(ASCII) 도면 파서 — 엔티티/레이어/거리 단위/외곽 범위 추출
// DWG 바이너리는 별도 변환기가 필요하므로 여기서 다루지 않는다.

export type DxfPair = { code: number; value: string };

export type DxfEntity = {
  type: string;
  layer: string;
  codes: Record<number, string[]>;
  handle?: string;
};

export type DxfPolyline = { points: [number, number][]; closed: boolean; layer: string; sourceType: string };

export type DxfDrawing = {
  layers: string[];
  entities: DxfEntity[];
  entityCounts: Record<string, number>;
  extents: { min: [number, number]; max: [number, number] } | null;
  units: string;
  unitCode: number | null;
  blockNames: string[];
  version: string | null;
};

export function tokenizeDxf(buffer: Buffer): DxfPair[] {
  const text = buffer.toString("latin1");
  const lines = text.split(/\r?\n/);
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeRaw = lines[i].trim();
    if (!codeRaw) {
      continue;
    }
    const code = Number(codeRaw);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: (lines[i + 1] ?? "").trim() });
  }
  return pairs;
}

function get(codes: Record<number, string[]>, code: number): string | undefined {
  return codes[code]?.[0];
}

function num(codes: Record<number, string[]>, code: number): number | undefined {
  const raw = get(codes, code);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

const UNIT_NAMES: Record<number, string> = {
  0: "단위 없음",
  1: "인치",
  2: "피트",
  4: "밀리미터",
  5: "센티미터",
  6: "미터",
};

export function parseDxf(buffer: Buffer): DxfDrawing {
  const pairs = tokenizeDxf(buffer);
  const entities: DxfEntity[] = [];
  const layers = new Set<string>();
  const blockNames = new Set<string>();
  const entityCounts: Record<string, number> = {};
  let current: DxfEntity | null = null;
  let section = "";
  let expectSectionName = false;
  let extents: DxfDrawing["extents"] = null;
  let unitCode: number | null = null;
  let version: string | null = null;
  let headerVar = "";
  const extMin: { x?: number; y?: number } = {};
  const extMax: { x?: number; y?: number } = {};

  const flush = () => {
    if (!current) return;
    current.layer = get(current.codes, 8) ?? "0";
    layers.add(current.layer);
    entities.push(current);
    entityCounts[current.type] = (entityCounts[current.type] ?? 0) + 1;
    current = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];
    if (code === 0 && value === "SECTION") {
      flush();
      expectSectionName = true;
      continue;
    }
    if (expectSectionName) {
      section = value;
      expectSectionName = false;
      continue;
    }
    if (code === 0 && value === "ENDSEC") {
      flush();
      section = "";
      continue;
    }
    if (code === 0 && value === "EOF") {
      flush();
      break;
    }
    if (section === "HEADER") {
      if (code === 9) headerVar = value;
      if (headerVar === "$EXTMIN") {
        if (code === 10) extMin.x = Number(value);
        if (code === 20) extMin.y = Number(value);
      }
      if (headerVar === "$EXTMAX") {
        if (code === 10) extMax.x = Number(value);
        if (code === 20) extMax.y = Number(value);
      }
      if (headerVar === "$INSUNITS" && code === 70) unitCode = Number(value);
      if (headerVar === "$ACADVER" && code === 1) version = value;
      continue;
    }
    if (section === "TABLES") {
      if (code === 0 && value === "LAYER") {
        // 레이어 항목은 다음 코드 2 값
        const next = pairs[i + 1];
        if (next && next.code === 2) layers.add(next.value);
      }
      continue;
    }
    if (section === "BLOCKS") {
      if (code === 0 && value === "BLOCK") {
        const namePair = pairs.slice(i, i + 6).find((p) => p.code === 2);
        if (namePair) blockNames.add(namePair.value);
      }
      continue;
    }
    if (section === "ENTITIES") {
      if (code === 0) {
        flush();
        current = { type: value, layer: "0", codes: {} };
      } else if (current) {
        (current.codes[code] ??= []).push(value);
      }
    }
  }
  flush();

  if (typeof extMin.x === "number" && typeof extMin.y === "number" && typeof extMax.x === "number" && typeof extMax.y === "number") {
    extents = { min: [extMin.x, extMin.y], max: [extMax.x, extMax.y] };
  }

  return {
    layers: Array.from(layers).filter(Boolean),
    entities,
    entityCounts,
    extents,
    units: unitCode !== null ? UNIT_NAMES[unitCode] ?? "알 수 없음" : "도면 단위(미지정)",
    unitCode,
    blockNames: Array.from(blockNames),
    version,
  };
}

/** 닫힌 폴리라인/원/호를 포함한 2D 선형 형상 추출 */
export function entityPolylines(entity: DxfEntity): DxfPolyline[] {
  const { type, layer, codes } = entity;
  const layerName = layer || "0";
  if (type === "LINE") {
    const x1 = num(codes, 10);
    const y1 = num(codes, 20);
    const x2 = num(codes, 11);
    const y2 = num(codes, 21);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return [];
    return [{ points: [[x1, y1], [x2, y2]], closed: false, layer: layerName, sourceType: type }];
  }
  if (type === "CIRCLE") {
    const cx = num(codes, 10);
    const cy = num(codes, 20);
    const r = num(codes, 40);
    if (cx === undefined || cy === undefined || r === undefined || r <= 0) return [];
    const points: [number, number][] = [];
    const seg = 48;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return [{ points, closed: true, layer: layerName, sourceType: type }];
  }
  if (type === "ARC") {
    const cx = num(codes, 10);
    const cy = num(codes, 20);
    const r = num(codes, 40);
    const a0 = num(codes, 50) ?? 0;
    const a1 = num(codes, 51) ?? 360;
    if (cx === undefined || cy === undefined || r === undefined || r <= 0) return [];
    const start = (a0 * Math.PI) / 180;
    let end = (a1 * Math.PI) / 180;
    while (end <= start) end += Math.PI * 2;
    const points: [number, number][] = [];
    const seg = Math.max(8, Math.round(((end - start) / (Math.PI * 2)) * 48));
    for (let i = 0; i <= seg; i++) {
      const t = start + ((end - start) * i) / seg;
      points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return [{ points, closed: false, layer: layerName, sourceType: type }];
  }
  if (type === "LWPOLYLINE" || type === "POLYLINE") {
    const xs = codes[10] ?? [];
    const ys = codes[20] ?? [];
    const points: [number, number][] = [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      const x = Number(xs[i]);
      const y = Number(ys[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
    if (points.length < 2) return [];
    const flags = Number(get(codes, 70) ?? 0);
    return [{ points, closed: (flags & 1) === 1, layer: layerName, sourceType: type }];
  }
  if (type === "SPLINE") {
    const xs = codes[10] ?? [];
    const ys = codes[20] ?? [];
    const points: [number, number][] = [];
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      const x = Number(xs[i]);
      const y = Number(ys[i]);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
    return points.length >= 2 ? [{ points, closed: false, layer: layerName, sourceType: type }] : [];
  }
  return [];
}

export function drawingExtents(drawing: DxfDrawing): { min: [number, number]; max: [number, number]; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entity of drawing.entities) {
    for (const poly of entityPolylines(entity)) {
      for (const [x, y] of poly.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) {
    if (drawing.extents) {
      return {
        min: drawing.extents.min,
        max: drawing.extents.max,
        width: drawing.extents.max[0] - drawing.extents.min[0],
        height: drawing.extents.max[1] - drawing.extents.min[1],
      };
    }
    return { min: [0, 0], max: [100, 100], width: 100, height: 100 };
  }
  return { min: [minX, minY], max: [maxX, maxY], width: maxX - minX, height: maxY - minY };
}

export function dxfTextEntities(drawing: DxfDrawing): { text: string; layer: string; x: number; y: number }[] {
  const out: { text: string; layer: string; x: number; y: number }[] = [];
  for (const entity of drawing.entities) {
    if (entity.type !== "TEXT" && entity.type !== "MTEXT") continue;
    const text = entity.codes[1]?.[0] ?? "";
    if (!text) continue;
    out.push({ text: text.slice(0, 200), layer: entity.layer, x: num(entity.codes, 10) ?? 0, y: num(entity.codes, 20) ?? 0 });
  }
  return out;
}
