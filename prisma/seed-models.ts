import { boxGeom, cylinderGeom, encodeGlb, makeMesh, meshStats, torusGeom, type MeshData } from "../src/lib/glb";
import type { GeomArrays } from "../src/lib/glb";
import { buildDxfReference, type AiAnalysis } from "../src/lib/reference";
import type { DxfDrawing, DxfEntity } from "../src/lib/parsers/dxf";

export type DemoPart = {
  nodeName: string;
  name: string;
  description: string;
  material: string;
  spec?: string;
  weight?: number;
  quantity?: number;
  moldRole?: string | null;
  motionGroup?: string | null;
};

export type DemoAnnotation = { title: string; body: string; x: number; y: number; z: number };
export type DemoCamera = { name: string; position: [number, number, number]; target: [number, number, number] };

export type DemoModel = {
  key: string;
  title: string;
  description: string;
  industry: string;
  template: string;
  background: string;
  renderMode: "MESH_3D" | "AI_REFERENCE_3D";
  isAiReference: boolean;
  aiMode: string;
  aiAnalysis: AiAnalysis | null;
  meshes: MeshData[];
  parts: DemoPart[];
  annotations: DemoAnnotation[];
  cameras: DemoCamera[];
};

function hex(h: string): [number, number, number] {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

type Mat = { color?: string; metalness?: number; roughness?: number; opacity?: number };

class ModelBuilder {
  meshes: MeshData[] = [];
  parts: DemoPart[] = [];

  add(
    nodeName: string,
    geoms: GeomArrays | GeomArrays[],
    meta: Omit<DemoPart, "nodeName">,
    mat: Mat = {},
  ): void {
    const list = Array.isArray(geoms) ? geoms : [geoms];
    const mesh = makeMesh(nodeName, list, {
      color: hex(mat.color ?? "#9aa4b2"),
      metalness: mat.metalness ?? 0.8,
      roughness: mat.roughness ?? 0.35,
      opacity: mat.opacity ?? 1,
    });
    this.meshes.push(mesh);
    this.parts.push({ nodeName, ...meta });
  }

  box(name: string, size: [number, number, number], center: [number, number, number], meta: Omit<DemoPart, "nodeName">, mat: Mat = {}): void {
    this.add(name, boxGeom(size, center), meta, mat);
  }

  cyl(
    name: string,
    radius: number,
    height: number,
    center: [number, number, number],
    meta: Omit<DemoPart, "nodeName">,
    mat: Mat = {},
    axis: "x" | "y" | "z" = "y",
    radiusTop?: number,
  ): void {
    this.add(name, cylinderGeom(radius, height, 40, center, axis, radiusTop), meta, mat);
  }

  gear(
    name: string,
    radius: number,
    thickness: number,
    teeth: number,
    center: [number, number, number],
    meta: Omit<DemoPart, "nodeName">,
    color = "#b7c0ca",
  ): void {
    const geoms: GeomArrays[] = [cylinderGeom(radius, thickness, 48, center, "z")];
    const toothHeight = radius * 0.16;
    const toothWidth = (2 * Math.PI * radius) / teeth / 2.1;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const cx = center[0] + Math.cos(a) * (radius + toothHeight * 0.35);
      const cy = center[1] + Math.sin(a) * (radius + toothHeight * 0.35);
      const tangent: [number, number, number] = [-Math.sin(a), Math.cos(a), 0];
      const radial: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
      geoms.push(
        oriented(
          [cx, cy, center[2]],
          tangent,
          radial,
          [0, 0, 1],
          [toothWidth / 2, toothHeight / 2, thickness / 2],
        ),
      );
    }
    geoms.push(cylinderGeom(radius * 0.28, thickness * 1.25, 32, center, "z"));
    this.add(name, geoms, meta, { color, metalness: 0.95, roughness: 0.22 });
  }

  /** 축 방향 파이프 런 (꺾임 지점에 구 조인트) */
  pipe(name: string, points: [number, number, number][], radius: number, meta: Omit<DemoPart, "nodeName">, mat: Mat = {}): void {
    const geoms: GeomArrays[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;
      const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) geoms.push(cylinderGeom(radius, len + radius, 24, mid, "x"));
      else if (Math.abs(dy) >= Math.abs(dz)) geoms.push(cylinderGeom(radius, len + radius, 24, mid, "y"));
      else geoms.push(cylinderGeom(radius, len + radius, 24, mid, "z"));
      geoms.push(sphereGeom(radius, points[i]));
    }
    const last = points[points.length - 1];
    geoms.push(sphereGeom(radius, last));
    this.add(name, geoms, meta, mat);
  }
}

function oriented(center: [number, number, number], ax: [number, number, number], ay: [number, number, number], az: [number, number, number], half: [number, number, number]): GeomArrays {
  const normalize = (v: [number, number, number]): [number, number, number] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const ux = normalize(ax);
  const uy = normalize(ay);
  const uz = normalize(az);
  const corner = (sx: number, sy: number, sz: number): [number, number, number] => [
    center[0] + ux[0] * half[0] * sx + uy[0] * half[1] * sy + uz[0] * half[2] * sz,
    center[1] + ux[1] * half[0] * sx + uy[1] * half[1] * sy + uz[1] * half[2] * sz,
    center[2] + ux[2] * half[0] * sx + uy[2] * half[1] * sy + uz[2] * half[2] * sz,
  ];
  const p = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
  const faces: { idx: [number, number, number, number]; n: [number, number, number] }[] = [
    { idx: [4, 5, 6, 7], n: uz },
    { idx: [1, 0, 3, 2], n: [-uz[0], -uz[1], -uz[2]] },
    { idx: [5, 1, 2, 6], n: ux },
    { idx: [0, 4, 7, 3], n: [-ux[0], -ux[1], -ux[2]] },
    { idx: [7, 6, 2, 3], n: uy },
    { idx: [0, 1, 5, 4], n: [-uy[0], -uy[1], -uy[2]] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const i of f.idx) {
      const v = p[i];
      positions.push(v[0], v[1], v[2]);
      normals.push(f.n[0], f.n[1], f.n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function sphereGeom(radius: number, center: [number, number, number]): GeomArrays {
  const lat = 14;
  const lon = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= lat; i++) {
    const theta = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const phi = (j / lon) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(center[0] + x * radius, center[1] + y * radius, center[2] + z * radius);
      normals.push(x, y, z);
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j;
      const b = (i + 1) * (lon + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

const STEEL = { color: "#aeb8c4", metalness: 0.95, roughness: 0.24 };
const DARKSTEEL = { color: "#7d8794", metalness: 0.9, roughness: 0.32 };
const PAINT = { color: "#3f4a58", metalness: 0.25, roughness: 0.62 };
const COPPER = { color: "#c87f3a", metalness: 0.95, roughness: 0.28 };
const BRASS = { color: "#c9a227", metalness: 0.9, roughness: 0.25 };
const GLASS = { color: "#a8d8e8", metalness: 0.1, roughness: 0.05, opacity: 0.35 };
const PLASTIC = { color: "#2f6f8f", metalness: 0.05, roughness: 0.55 };

/** 1. 사출금형 개폐 데모 */
export function moldDemo(): DemoModel {
  const b = new ModelBuilder();
  b.box("BASE_LOWER", [1.0, 0.09, 1.0], [0, 0.045, 0], { name: "하부 고정판", description: "금형을 프레스에 고정하는 하부 클램프 플레이트", material: "PAINT", moldRole: "BASE", weight: 42, spec: "1000 × 1000 × 90 mm" }, PAINT);
  b.box("EJECTOR_PLATE", [0.5, 0.05, 0.5], [0, 0.13, 0], { name: "이젝터 플레이트", description: "이젝터 핀을 밀어 성형품을 취출하는 플레이트", material: "STEEL", moldRole: "EJECTOR", weight: 12, spec: "500 × 500 × 50 mm" }, DARKSTEEL);
  b.box("SUPPORT_PLATE", [0.86, 0.12, 0.86], [0, 0.22, 0], { name: "받침판", description: "코어 플레이트를 지지하는 서포트 플레이트", material: "STEEL", moldRole: "BASE", weight: 58, spec: "860 × 860 × 120 mm" }, STEEL);
  b.box("CORE_PLATE", [0.8, 0.16, 0.8], [0, 0.36, 0], { name: "코어 플레이트", description: "코어 인서트를 고정하는 가동측 플레이트", material: "STEEL", moldRole: "CORE", weight: 64, spec: "800 × 800 × 160 mm" }, STEEL);
  b.box("CORE_BLOCK", [0.42, 0.2, 0.42], [0, 0.54, 0], { name: "코어 블록", description: "성형품 내부 형상을 만드는 코어 인서트", material: "STEEL", moldRole: "CORE", weight: 21, spec: "420 × 420 × 200 mm" }, { color: "#93a2b4", metalness: 0.95, roughness: 0.18 });
  b.box("SLIDE_LEFT", [0.16, 0.2, 0.32], [-0.37, 0.54, 0], { name: "좌측 슬라이드 코어", description: "언더컷 형상을 성형하는 슬라이드 코어 (좌)", material: "STEEL", moldRole: "SLIDE", weight: 7.4, spec: "160 × 200 × 320 mm" }, { color: "#e0a25a", metalness: 0.85, roughness: 0.3 });
  b.box("SLIDE_RIGHT", [0.16, 0.2, 0.32], [0.37, 0.54, 0], { name: "우측 슬라이드 코어", description: "언더컷 형상을 성형하는 슬라이드 코어 (우)", material: "STEEL", moldRole: "SLIDE", weight: 7.4, spec: "160 × 200 × 320 mm" }, { color: "#e0a25a", metalness: 0.85, roughness: 0.3 });
  b.box("CAVITY_INSERT", [0.42, 0.12, 0.42], [0, 0.7, 0], { name: "캐비티 인서트", description: "성형품 외관 형상을 만드는 캐비티 인서트", material: "STEEL", moldRole: "CAVITY", weight: 16, spec: "420 × 420 × 120 mm" }, { color: "#b9c8d6", metalness: 0.95, roughness: 0.2 });
  b.box("CAVITY_PLATE", [0.8, 0.16, 0.8], [0, 0.84, 0], { name: "캐비티 플레이트", description: "캐비티 인서트를 고정하는 고정측 플레이트", material: "STEEL", moldRole: "CAVITY", weight: 64, spec: "800 × 800 × 160 mm" }, STEEL);
  b.box("TOP_CLAMP", [1.0, 0.09, 1.0], [0, 0.965, 0], { name: "상부 고정판", description: "금형 상부를 프레스 램에 고정하는 클램프 플레이트", material: "PAINT", moldRole: "BASE", weight: 42, spec: "1000 × 1000 × 90 mm" }, PAINT);
  for (const [i, sx] of [1, -1].entries()) {
    for (const [j, sz] of [1, -1].entries()) {
      const n = i * 2 + j + 1;
      b.cyl(`GUIDE_PIN_${n}`, 0.028, 0.9, [sx * 0.44, 0.48, sz * 0.44], { name: `가이드 핀 ${n}`, description: "상·하부 금형의 정렬을 유지하는 가이드 핀", material: "STEEL", weight: 3.1, spec: "Ø56 × 900 mm" }, { color: "#d6dde6", metalness: 1, roughness: 0.15 });
    }
  }
  for (const [i, sx] of [1, -1].entries()) {
    for (const [j, sz] of [1, -1].entries()) {
      const n = i * 2 + j + 1;
      b.cyl(`EJECTOR_PIN_${n}`, 0.012, 0.42, [sx * 0.13, 0.34, sz * 0.13], { name: `이젝터 핀 ${n}`, description: "성형품을 밀어내는 이젝터 핀", material: "STEEL", moldRole: "EJECTOR", weight: 0.34, spec: "Ø24 × 420 mm" }, { color: "#e6ecf3", metalness: 1, roughness: 0.12 });
    }
  }
  b.cyl("SPRUE_BUSH", 0.055, 0.18, [0, 1.1, 0], { name: "스프루 부시", description: "용융 수지를 금형 내부로 유도하는 스프루 부시", material: "BRASS", weight: 4.2, spec: "Ø110 × 180 mm" }, BRASS);
  b.add("LOCATING_RING", torusGeom(0.11, 0.018, [0, 1.2, 0], "y"), { name: "로케이팅 링", description: "노즐과 금형의 중심을 맞추는 링", material: "STEEL", weight: 1.8, spec: "Ø220 × 36 mm" }, STEEL);
  b.cyl("COOLING_INLET", 0.018, 0.22, [-0.5, 0.36, 0.3], { name: "냉각수 인렛", description: "금형 온도 제어용 냉각수 유입 포트", material: "BRASS", weight: 0.6, spec: "Ø36 × 220 mm" }, BRASS, "x");
  b.cyl("COOLING_OUTLET", 0.018, 0.22, [0.5, 0.36, -0.3], { name: "냉각수 아웃렛", description: "냉각수 배출 포트", material: "BRASS", weight: 0.6, spec: "Ø36 × 220 mm" }, BRASS, "x");

  return {
    key: "mold",
    title: "사출금형 개폐 데모",
    description:
      "2플레이트 사출금형 조립체. 클램프 해제 → 코어/캐비티 분리 → 슬라이드 후퇴 → 이젝터 취출 순서를 단계별 애니메이션으로 확인합니다.",
    industry: "MOLD",
    template: "MOLD_TECH",
    background: "DARK",
    renderMode: "MESH_3D",
    isAiReference: false,
    aiMode: "NONE",
    aiAnalysis: null,
    meshes: b.meshes,
    parts: b.parts,
    annotations: [
      { title: "캐비티 · 코어 분리면", body: "제품 형상이 완성되는 파팅 라인입니다. 분해도에서 Y축 방향으로 벌어집니다.", x: 0.25, y: 0.68, z: 0.28 },
      { title: "슬라이드 코어", body: "언더컷 성형을 위해 좌우로 후퇴하는 슬라이드 코어입니다. 개폐 시퀀스 3단계에서 작동합니다.", x: -0.37, y: 0.54, z: 0.2 },
      { title: "이젝터 핀", body: "성형품 취출을 담당합니다. 4단계에서 상승합니다.", x: 0.13, y: 0.42, z: 0.13 },
    ],
    cameras: [
      { name: "기본 3/4 뷰", position: [1.7, 1.6, 2.1], target: [0, 0.55, 0] },
      { name: "정면", position: [0, 0.6, 2.8], target: [0, 0.6, 0] },
      { name: "상부", position: [0.01, 3.0, 0.01], target: [0, 0.5, 0] },
    ],
  };
}

/** 2. 산업용 기어 감속기 분해 데모 */
export function gearboxDemo(): DemoModel {
  const b = new ModelBuilder();
  b.box("BASE_PLATE", [0.9, 0.06, 0.7], [0, 0.03, 0], { name: "베이스 플레이트", description: "감속기를 고정하는 설치 베이스", material: "PAINT", weight: 14, spec: "900 × 700 × 60 mm" }, PAINT);
  b.box("HOUSING_BACK", [0.86, 0.5, 0.035], [0, 0.31, -0.29], { name: "하우징 후면", description: "감속기 하우징 후면 벽", material: "PAINT", weight: 18, spec: "860 × 500 × 35 mm" }, { color: "#30506f", metalness: 0.35, roughness: 0.55 });
  b.box("HOUSING_LEFT", [0.035, 0.5, 0.58], [-0.43, 0.31, 0], { name: "하우징 좌측", description: "하우징 측벽 (좌)", material: "PAINT", weight: 9, spec: "35 × 500 × 580 mm" }, { color: "#30506f", metalness: 0.35, roughness: 0.55 });
  b.box("HOUSING_RIGHT", [0.035, 0.5, 0.58], [0.43, 0.31, 0], { name: "하우징 우측", description: "하우징 측벽 (우)", material: "PAINT", weight: 9, spec: "35 × 500 × 580 mm" }, { color: "#30506f", metalness: 0.35, roughness: 0.55 });
  b.box("HOUSING_TOP", [0.86, 0.035, 0.58], [0, 0.56, 0], { name: "하우징 상부", description: "하우징 상부 커버", material: "PAINT", weight: 7, spec: "860 × 35 × 580 mm" }, { color: "#30506f", metalness: 0.35, roughness: 0.55 });
  b.box("HOUSING_COVER", [0.86, 0.5, 0.035], [0, 0.31, 0.29], { name: "하우징 커버", description: "정비용 전면 커버 — 분해도에서 가장 먼저 분리됩니다.", material: "PAINT", weight: 16, spec: "860 × 500 × 35 mm" }, { color: "#3d6288", metalness: 0.35, roughness: 0.5 });
  b.cyl("INPUT_SHAFT", 0.032, 0.85, [-0.2, 0.42, 0], { name: "입력축", description: "모터에서 동력을 받는 입력축", material: "STEEL", motionGroup: "SHAFT", weight: 5.4, spec: "Ø64 × 850 mm" }, { color: "#dfe6ee", metalness: 1, roughness: 0.12 }, "z");
  b.cyl("OUTPUT_SHAFT", 0.05, 0.8, [0.12, 0.3, 0], { name: "출력축", description: "감속된 토크를 출력하는 축", material: "STEEL", motionGroup: "SHAFT", weight: 12.6, spec: "Ø100 × 800 mm" }, { color: "#dfe6ee", metalness: 1, roughness: 0.12 }, "z");
  b.gear("GEAR_1", 0.16, 0.07, 26, [-0.2, 0.42, -0.08], { name: "입력 기어", description: "입력축에 장착된 구동 기어 (26T)", material: "STEEL", motionGroup: "GEAR", weight: 4.8, spec: "Ø320 · 26T · 모듈 6" }, "#c3cedb");
  b.gear("GEAR_2", 0.24, 0.07, 39, [0.12, 0.3, 0.06], { name: "중간 기어", description: "감속비를 만드는 대형 피동 기어 (39T)", material: "STEEL", motionGroup: "GEAR", weight: 11.2, spec: "Ø480 · 39T · 모듈 6" }, "#b5c2d1");
  b.gear("GEAR_3", 0.09, 0.06, 15, [0.12, 0.3, -0.12], { name: "피니언", description: "출력축 피니언 (15T)", material: "STEEL", motionGroup: "GEAR", weight: 1.9, spec: "Ø180 · 15T · 모듈 6" }, "#ccd6e2");
  const bearings: [string, number, number][] = [
    ["베어링 1", -0.2, 0.24],
    ["베어링 2", -0.2, -0.24],
    ["베어링 3", 0.12, 0.24],
    ["베어링 4", 0.12, -0.24],
  ];
  bearings.forEach(([label, x, z], i) => {
    b.add(`BEARING_${i + 1}`, torusGeom(0.062, 0.016, [x, i < 2 ? 0.42 : 0.3, z], "z"), { name: `${label}`, description: "축을 지지하는 롤러 베어링", material: "STEEL", weight: 0.9, spec: "Ø156 × 32 mm" }, { color: "#8d99a8", metalness: 1, roughness: 0.25 });
  });
  b.cyl("MOTOR_FLANGE", 0.13, 0.12, [-0.2, 0.42, -0.42], { name: "모터 플랜지", description: "모터와 감속기를 연결하는 플랜지", material: "ALUMINUM", weight: 3.3, spec: "Ø260 × 120 mm" }, { color: "#c8d2dc", metalness: 0.85, roughness: 0.32 }, "z");
  b.cyl("MOTOR_BODY", 0.16, 0.34, [-0.2, 0.42, -0.65], { name: "모터 바디", description: "구동 모터 하우징", material: "PAINT", weight: 22, spec: "Ø320 × 340 mm" }, { color: "#2c3542", metalness: 0.4, roughness: 0.5 }, "z");
  b.cyl("FAN_COVER", 0.15, 0.06, [-0.2, 0.42, -0.85], { name: "팬 커버", description: "모터 냉각팬 커버", material: "PLASTIC", weight: 0.8, spec: "Ø300 × 60 mm" }, { color: "#1d232c", metalness: 0.1, roughness: 0.7 }, "z");
  b.add("COOLING_FAN", [cylinderGeom(0.04, 0.05, 20, [-0.2, 0.42, -0.83], "z")], { name: "냉각팬", description: "모터 냉각팬 — 작동 애니메이션에서 회전합니다.", material: "ALUMINUM", motionGroup: "FAN", weight: 0.4, spec: "Ø80 mm" }, { color: "#e5e9ee", metalness: 0.6, roughness: 0.4 });
  b.box("OIL_GAUGE", [0.06, 0.1, 0.03], [0.34, 0.18, 0.3], { name: "오일 게이지", description: "윤활유 잔량 확인용 사이트 글라스", material: "GLASS", weight: 0.1, spec: "60 × 100 mm" }, GLASS);
  b.box("MOUNT_FOOT_L", [0.14, 0.08, 0.5], [-0.36, 0.09, 0], { name: "좌측 마운트", description: "베이스에 체결되는 설치 풋", material: "STEEL", weight: 3.6, spec: "140 × 80 × 500 mm" }, DARKSTEEL);
  b.box("MOUNT_FOOT_R", [0.14, 0.08, 0.5], [0.36, 0.09, 0], { name: "우측 마운트", description: "베이스에 체결되는 설치 풋", material: "STEEL", weight: 3.6, spec: "140 × 80 × 500 mm" }, DARKSTEEL);
  b.box("NAMEPLATE", [0.16, 0.1, 0.006], [0.2, 0.5, 0.31], { name: "명판", description: "감속비·정격 토크가 각인된 명판 (39:15 ≈ 2.6:1)", material: "STAINLESS", weight: 0.2, spec: "160 × 100 mm" }, { color: "#cdd6df", metalness: 1, roughness: 0.2 });

  return {
    key: "gearbox",
    title: "산업용 기어 감속기 분해 데모",
    description:
      "2단 기어 감속기. 하우징 → 커버 → 기어 → 축 → 베어링 순서의 분해도와, 입력축·기어의 회전 작동 애니메이션을 제공합니다.",
    industry: "MACHINE",
    template: "INDUSTRIAL",
    background: "STUDIO",
    renderMode: "MESH_3D",
    isAiReference: false,
    aiMode: "NONE",
    aiAnalysis: null,
    meshes: b.meshes,
    parts: b.parts,
    annotations: [
      { title: "감속비 2.6 : 1", body: "입력 기어 26T → 중간 기어 39T 조합으로 약 2.6:1 감속합니다.", x: 0.12, y: 0.3, z: 0.2 },
      { title: "입력축 베어링", body: "입력축 양단의 롤러 베어링입니다. 분해도에서 Z축으로 빠집니다.", x: -0.2, y: 0.42, z: 0.24 },
      { title: "오일 사이트 글라스", body: "윤활유 상태를 확인하는 투명 게이지입니다. X-Ray 모드에서 내부가 보입니다.", x: 0.34, y: 0.18, z: 0.3 },
    ],
    cameras: [
      { name: "기본 3/4 뷰", position: [1.5, 1.2, 1.8], target: [0, 0.3, 0] },
      { name: "측면", position: [2.4, 0.5, 0.2], target: [0, 0.3, 0] },
      { name: "상부", position: [0.01, 2.4, 0.01], target: [0, 0.3, 0] },
    ],
  };
}

/** 3. 전기 분전반 내부투시 데모 */
export function panelDemo(): DemoModel {
  const b = new ModelBuilder();
  const cabinet = { color: "#b9c0c7", metalness: 0.35, roughness: 0.55 };
  b.box("BACK_PANEL", [0.8, 1.8, 0.02], [0, 0.9, -0.16], { name: "후면판", description: "분전반 후면 마운팅 패널", material: "PAINT", weight: 24, spec: "800 × 1800 × 20 mm" }, cabinet);
  b.box("SIDE_LEFT", [0.02, 1.8, 0.34], [-0.39, 0.9, 0], { name: "좌측판", description: "분전반 좌측 측판", material: "PAINT", weight: 11, spec: "20 × 1800 × 340 mm" }, cabinet);
  b.box("SIDE_RIGHT", [0.02, 1.8, 0.34], [0.39, 0.9, 0], { name: "우측판", description: "분전반 우측 측판", material: "PAINT", weight: 11, spec: "20 × 1800 × 340 mm" }, cabinet);
  b.box("TOP_PANEL", [0.8, 0.02, 0.34], [0, 1.79, 0], { name: "상부판", description: "분전반 상부 커버", material: "PAINT", weight: 5, spec: "800 × 20 × 340 mm" }, cabinet);
  b.box("BOTTOM_PANEL", [0.8, 0.02, 0.34], [0, 0.01, 0], { name: "하부판", description: "케이블 인입용 하부판", material: "PAINT", weight: 5, spec: "800 × 20 × 340 mm" }, cabinet);
  b.box("DOOR", [0.78, 1.74, 0.02], [0, 0.92, 0.18], { name: "도어", description: "잠금장치가 있는 전면 도어 — 내부 투시를 위해 숨김/투명화 가능", material: "PAINT", weight: 18, spec: "780 × 1740 × 20 mm" }, { color: "#c6ccd3", metalness: 0.35, roughness: 0.5 });
  b.cyl("DOOR_HANDLE", 0.014, 0.16, [0.32, 0.95, 0.21], { name: "도어 핸들", description: "도어 개방용 핸들", material: "STAINLESS", weight: 0.3, spec: "Ø28 × 160 mm" }, { color: "#dfe5eb", metalness: 1, roughness: 0.2 });
  b.box("MAIN_BREAKER", [0.22, 0.3, 0.12], [0, 1.5, 0], { name: "메인 차단기", description: "3상 4선식 메인 MCCB 250A", material: "PLASTIC", weight: 3.2, spec: "250AF / 3P" }, { color: "#232a33", metalness: 0.1, roughness: 0.6 });
  const breakers: [number, number][] = [
    [1.12, 125],
    [0.82, 100],
    [0.52, 60],
  ];
  breakers.forEach(([y, amp], i) => {
    b.box(`BREAKER_${i + 1}`, [0.18, 0.22, 0.11], [0, y, 0], { name: `분기 차단기 ${i + 1}`, description: `분기 회로용 MCCB ${amp}A`, material: "PLASTIC", weight: 1.1, spec: `${amp}AF / 3P` }, { color: "#e6e9ec", metalness: 0.1, roughness: 0.55 });
  });
  b.box("BUSBAR_L1", [0.62, 0.03, 0.05], [0, 1.3, -0.1], { name: "모선 L1", description: "R상 주 모선 (동바)", material: "COPPER", weight: 8.4, spec: "30 × 50 × 620 mm" }, COPPER);
  b.box("BUSBAR_L2", [0.62, 0.03, 0.05], [0, 1.25, -0.1], { name: "모선 L2", description: "S상 주 모선 (동바)", material: "COPPER", weight: 8.4, spec: "30 × 50 × 620 mm" }, COPPER);
  b.box("BUSBAR_L3", [0.62, 0.03, 0.05], [0, 1.2, -0.1], { name: "모선 L3", description: "T상 주 모선 (동바)", material: "COPPER", weight: 8.4, spec: "30 × 50 × 620 mm" }, COPPER);
  b.box("METER_BODY", [0.3, 0.2, 0.09], [0.15, 1.66, 0.06], { name: "전력량계", description: "사용 전력량을 표시하는 계량기", material: "PLASTIC", weight: 1.4, spec: "300 × 200 × 90 mm" }, { color: "#2a3139", metalness: 0.15, roughness: 0.5 });
  b.box("METER_GLASS", [0.26, 0.14, 0.008], [0.15, 1.66, 0.11], { name: "계량기 유리", description: "계량기 표시창", material: "GLASS", weight: 0.1, spec: "260 × 140 mm" }, GLASS);
  b.box("TERMINAL_BLOCK", [0.52, 0.08, 0.1], [0, 0.3, 0], { name: "단자대", description: "외부 케이블 접속용 단자대", material: "PLASTIC", weight: 0.9, spec: "520 × 80 × 100 mm" }, { color: "#3a444f", metalness: 0.1, roughness: 0.6 });
  b.box("CABLE_TRAY", [0.7, 0.04, 0.18], [0, 0.14, 0.02], { name: "케이블 트레이", description: "내부 배선 정리용 트레이", material: "STEEL", weight: 2.2, spec: "700 × 40 × 180 mm" }, DARKSTEEL);
  b.cyl("COOLING_FAN", 0.075, 0.04, [0.28, 1.62, -0.1], { name: "냉각팬", description: "분전반 내부 온도 제어팬", material: "ALUMINUM", motionGroup: "FAN", weight: 0.4, spec: "Ø150 × 40 mm" }, { color: "#c8d0d8", metalness: 0.6, roughness: 0.4 }, "z");
  b.cyl("INSULATOR_1", 0.025, 0.08, [-0.28, 1.35, -0.1], { name: "애자 1", description: "모선 지지용 절연 애자", material: "PLASTIC", weight: 0.2, spec: "Ø50 × 80 mm" }, { color: "#c96a3a", metalness: 0.05, roughness: 0.5 });
  b.cyl("INSULATOR_2", 0.025, 0.08, [0.28, 1.35, -0.1], { name: "애자 2", description: "모선 지지용 절연 애자", material: "PLASTIC", weight: 0.2, spec: "Ø50 × 80 mm" }, { color: "#c96a3a", metalness: 0.05, roughness: 0.5 });
  b.box("EARTH_BAR", [0.5, 0.025, 0.03], [0, 0.42, -0.12], { name: "접지 동바", description: "보호 접지용 동바", material: "COPPER", weight: 1.2, spec: "500 × 25 × 30 mm" }, { color: "#b06a35", metalness: 0.95, roughness: 0.35 });

  return {
    key: "panel",
    title: "전기 분전반 내부투시 데모",
    description:
      "3상 4선식 배전반. 도어를 투명화하고 X-Ray 로 내부 차단기·모선·계량기 배치를 확인하는 고객 설명용 쇼룸입니다.",
    industry: "ELECTRIC",
    template: "ELECTRONICS",
    background: "WHITE",
    renderMode: "MESH_3D",
    isAiReference: false,
    aiMode: "NONE",
    aiAnalysis: null,
    meshes: b.meshes,
    parts: b.parts,
    annotations: [
      { title: "내부 투시로 확인", body: "도어를 숨기고 X-Ray 를 켜면 차단기와 모선 배치가 한눈에 보입니다.", x: 0, y: 1.2, z: 0.14 },
      { title: "메인 차단기 250A", body: "3상 4선식 메인 MCCB 입니다. 정격 250AF.", x: 0, y: 1.5, z: 0.1 },
      { title: "모선 (동바)", body: "L1/L2/L3 3상 모선이 수직으로 배치됩니다. 각 상은 색상으로 구분됩니다.", x: 0, y: 1.25, z: -0.1 },
    ],
    cameras: [
      { name: "기본 3/4 뷰", position: [1.2, 1.5, 1.6], target: [0, 0.9, 0] },
      { name: "정면", position: [0, 1.0, 2.2], target: [0, 0.9, 0] },
      { name: "내부 상부", position: [0.6, 1.9, 1.0], target: [0, 1.2, 0] },
    ],
  };
}

/** 4. 건축 플랜트 배관 데모 */
export function plantDemo(): DemoModel {
  const b = new ModelBuilder();
  b.box("FLOOR_SLAB", [3.2, 0.1, 2.4], [0, -0.05, 0], { name: "기계실 바닥", description: "펌프·탱크가 설치되는 콘크리트 슬래브", material: "PAINT", weight: 1800, spec: "3200 × 2400 × 100 mm" }, { color: "#4a4f57", metalness: 0.05, roughness: 0.85 });
  b.cyl("PUMP_BODY", 0.28, 0.5, [-0.8, 0.45, 0], { name: "펌프 본체", description: "원심 펌프 케이싱", material: "STEEL", motionGroup: "PUMP", weight: 68, spec: "Ø560 × 500 mm" }, { color: "#3f6f9e", metalness: 0.7, roughness: 0.35 }, "x");
  b.cyl("PUMP_MOTOR", 0.22, 0.55, [-1.5, 0.48, 0], { name: "펌프 모터", description: "펌프 구동 모터 22kW", material: "PAINT", weight: 52, spec: "Ø440 × 550 mm" }, { color: "#2b4b6f", metalness: 0.4, roughness: 0.5 }, "x");
  b.cyl("PUMP_COUPLING", 0.09, 0.14, [-1.18, 0.46, 0], { name: "커플링", description: "모터-펌프 축 커플링", material: "STEEL", motionGroup: "SHAFT", weight: 4.2, spec: "Ø180 × 140 mm" }, { color: "#c9d2db", metalness: 1, roughness: 0.2 }, "x");
  b.cyl("TANK_BODY", 0.45, 1.3, [1.1, 0.72, 0.4], { name: "저수 탱크", description: "1.5m³ 공정용 저수 탱크", material: "STAINLESS", weight: 160, spec: "Ø900 × 1300 mm" }, { color: "#c5ced7", metalness: 1, roughness: 0.22 });
  b.cyl("TANK_TOP", 0.46, 0.06, [1.1, 1.4, 0.4], { name: "탱크 상판", description: "탱크 상부 맨홀 커버", material: "STAINLESS", weight: 12, spec: "Ø920 × 60 mm" }, { color: "#d3dbe3", metalness: 1, roughness: 0.2 });
  b.pipe("PIPE_MAIN", [[-0.55, 0.55, 0], [0, 0.55, 0], [0, 1.25, 0], [0.65, 1.25, 0.4], [0.65, 1.25, 0.4], [1.1, 1.25, 0.4]], 0.07, { name: "메인 배관 (DN100)", description: "펌프 토출수에서 탱크로 이어지는 메인 배관", material: "STAINLESS", weight: 46, spec: "DN100 · SCH10S" }, { color: "#b9c4cf", metalness: 1, roughness: 0.25 });
  b.pipe("PIPE_BRANCH", [[-0.3, 0.55, 0], [-0.3, 0.55, 0.85], [0.7, 0.55, 0.85]], 0.045, { name: "분기 배관 (DN65)", description: "공정 라인으로 분기되는 배관", material: "STAINLESS", weight: 18, spec: "DN65 · SCH10S" }, { color: "#c2ccd6", metalness: 1, roughness: 0.25 });
  b.box("VALVE_BODY_1", [0.14, 0.16, 0.14], [0, 0.9, 0], { name: "게이트 밸브", description: "메인 라인 유량 차단 밸브", material: "STEEL", weight: 7.8, spec: "DN100 · 10K" }, { color: "#8a4a3a", metalness: 0.7, roughness: 0.4 });
  b.add("VALVE_WHEEL_1", torusGeom(0.1, 0.014, [0, 0.99, 0], "y"), { name: "밸브 핸들", description: "게이트 밸브 수동 핸들", material: "STEEL", weight: 1.1, spec: "Ø200 mm" }, { color: "#d0d6dd", metalness: 0.8, roughness: 0.35 });
  b.box("VALVE_BODY_2", [0.1, 0.12, 0.1], [0.35, 0.55, 0.85], { name: "분기 밸브", description: "분기 라인 볼 밸브", material: "STEEL", weight: 3.2, spec: "DN65" }, { color: "#8a4a3a", metalness: 0.7, roughness: 0.4 });
  b.add("VALVE_WHEEL_2", torusGeom(0.07, 0.012, [0.35, 0.63, 0.85], "y"), { name: "분기 밸브 핸들", description: "분기 밸브 핸들", material: "STEEL", weight: 0.6, spec: "Ø140 mm" }, { color: "#d0d6dd", metalness: 0.8, roughness: 0.35 });
  for (const [i, x] of [-2.0, 0.2, 2.2].entries()) {
    b.box(`COLUMN_${i + 1}`, [0.1, 2.3, 0.1], [x, 1.15, -0.95], { name: `구조 기둥 ${i + 1}`, description: "기계실 철골 기둥", material: "STEEL", weight: 38, spec: "H-100 × 2300 mm" }, { color: "#6d7783", metalness: 0.8, roughness: 0.4 });
  }
  b.box("BEAM", [3.2, 0.1, 0.12], [0, 2.35, -0.95], { name: "상부 보", description: "기둥을 잇는 철골 보", material: "STEEL", weight: 62, spec: "H-3200 mm" }, { color: "#6d7783", metalness: 0.8, roughness: 0.4 });
  b.box("DUCT", [0.5, 0.4, 1.9], [1.25, 1.95, -0.2], { name: "환기 덕트", description: "기계실 환기용 사각 덕트", material: "STAINLESS", weight: 34, spec: "500 × 400 × 1900 mm" }, { color: "#aab6c2", metalness: 0.85, roughness: 0.35 });
  b.box("CONTROL_PANEL", [0.4, 0.55, 0.14], [-1.9, 1.0, 0.55], { name: "제어반", description: "펌프 기동·정지 제어반", material: "PAINT", weight: 16, spec: "400 × 550 × 140 mm" }, { color: "#39424c", metalness: 0.3, roughness: 0.55 });
  b.box("PRESSURE_GAUGE", [0.08, 0.08, 0.02], [-0.05, 1.05, 0.1], { name: "압력계", description: "토출 압력 표시계", material: "GLASS", weight: 0.3, spec: "Ø80 mm" }, GLASS);

  return {
    key: "plant",
    title: "건축 플랜트 배관 데모",
    description:
      "기계실 펌프·탱크·배관 시스템. 단면 보기와 단계별 시공 순서, X-Ray 로 배관 경로를 설명하는 플랜트 쇼룸입니다.",
    industry: "ARCHITECTURE",
    template: "ARCHITECTURE",
    background: "STUDIO",
    renderMode: "MESH_3D",
    isAiReference: false,
    aiMode: "NONE",
    aiAnalysis: null,
    meshes: b.meshes,
    parts: b.parts,
    annotations: [
      { title: "메인 배관 경로", body: "펌프 토출구에서 상승 후 탱크로 연결됩니다. 단면(X/Y/Z) 슬라이더로 내부를 확인하세요.", x: 0, y: 1.25, z: 0.2 },
      { title: "게이트 밸브", body: "메인 라인 유량 차단용 수동 밸브입니다.", x: 0, y: 0.95, z: 0 },
      { title: "펌프-모터 커플링", body: "모터와 펌프를 연결하는 커플링으로, 작동 애니메이션에서 회전합니다.", x: -1.18, y: 0.46, z: 0 },
    ],
    cameras: [
      { name: "기본 3/4 뷰", position: [3.0, 2.2, 3.4], target: [0, 0.8, 0] },
      { name: "펌프 측면", position: [-3.2, 1.5, 1.6], target: [-0.8, 0.6, 0] },
      { name: "상부", position: [0.01, 4.2, 0.01], target: [0, 0.6, 0] },
    ],
  };
}

function ent(type: string, layer: string, codes: Record<number, string[]>): DxfEntity {
  return { type, layer, codes };
}

/** 5. 2D 도면 참고용 AI 3D 시각화 데모 (DXF 선형 형상 → relief) */
export function drawingDemo(): DemoModel {
  const outline: [number, number][] = [
    [40, 30], [280, 30], [280, 62], [300, 82], [300, 140], [262, 152], [58, 152], [40, 120],
  ];
  const entities: DxfEntity[] = [
    ent("LWPOLYLINE", "OUTLINE", {
      90: [String(outline.length)],
      70: ["1"],
      10: outline.map((p) => String(p[0])),
      20: outline.map((p) => String(p[1])),
    }),
  ];
  const holes: [number, number, number][] = [
    [95, 72, 12],
    [155, 72, 12],
    [215, 72, 12],
    [132, 125, 8],
    [198, 125, 8],
  ];
  holes.forEach(([x, y, r]) => {
    entities.push(ent("CIRCLE", "HOLES", { 10: [String(x)], 20: [String(y)], 40: [String(r)] }));
    entities.push(ent("LINE", "CENTER", { 10: [String(x - r - 6)], 20: [String(y)], 11: [String(x + r + 6)], 21: [String(y)] }));
    entities.push(ent("LINE", "CENTER", { 10: [String(x)], 20: [String(y - r - 6)], 11: [String(x)], 21: [String(y + r + 6)] }));
  });
  entities.push(ent("LINE", "DIM", { 10: ["40"], 20: ["170"], 11: ["300"], 21: ["170"] }));
  entities.push(ent("LINE", "DIM", { 10: ["320"], 20: ["30"], 11: ["320"], 21: ["152"] }));
  entities.push(ent("TEXT", "NOTE", { 1: ["MOUNTING BRACKET / AL6061-T6 / t=2.0"], 10: ["70"], 20: ["165"], 40: ["5"] }));

  const drawing: DxfDrawing = {
    layers: ["OUTLINE", "HOLES", "CENTER", "DIM", "NOTE"],
    entities,
    entityCounts: { LWPOLYLINE: 1, CIRCLE: holes.length, LINE: holes.length * 2 + 2, TEXT: 1 },
    extents: { min: [40, 30], max: [320, 170] },
    units: "밀리미터",
    unitCode: 4,
    blockNames: [],
    version: "AC1027",
  };
  const ref = buildDxfReference(drawing, { filename: "BRACKET-001_REV-A.dxf" });

  return {
    key: "drawing",
    title: "2D 도면 참고용 AI 3D 시각화 데모",
    description:
      "DXF 도면의 외곽·홀·중심선을 선형 형상 기준으로 입체화한 참고용 시각화입니다. 깊이 정보는 도면에 없어 가정값을 사용하며, 화면에 '참고용 AI 3D 시각화' 로 명확히 표시됩니다.",
    industry: "MANUFACTURING",
    template: "PRODUCT",
    background: "WHITE",
    renderMode: "AI_REFERENCE_3D",
    isAiReference: true,
    aiMode: ref.analysis.mode,
    aiAnalysis: ref.analysis,
    meshes: ref.meshes,
    parts: ref.parts.map((p) => ({
      nodeName: p.nodeName,
      name: p.name,
      description: p.description,
      material: p.material,
      spec: p.spec ?? undefined,
      weight: p.weight ?? undefined,
      quantity: 1,
    })),
    annotations: [
      { title: "참고용 시각화입니다", body: "도면의 깊이 값이 없어 두께를 가정했습니다. 정확한 형상은 3D 모델 업로드로 대체하세요.", x: 0, y: 0.08, z: 0.08 },
      { title: "홀 5개", body: "CIRCLE 엔티티에서 홀 후보 5개를 추출했습니다. 관통 여부는 확정하지 않았습니다.", x: 0.1, y: 0.04, z: 0 },
      { title: "외곽 윤곽", body: "닫힌 LWPOLYLINE 1개를 기준으로 외곽 벽체를 세웠습니다.", x: -0.2, y: 0.04, z: 0.1 },
    ],
    cameras: [
      { name: "기본 3/4 뷰", position: [0.45, 0.3, 0.5], target: [0, 0.03, 0] },
      { name: "상부", position: [0.001, 0.6, 0.001], target: [0, 0, 0] },
      { name: "정면", position: [0, 0.12, 0.55], target: [0, 0.03, 0] },
    ],
  };
}

export function allDemoModels(): DemoModel[] {
  return [moldDemo(), gearboxDemo(), panelDemo(), plantDemo(), drawingDemo()];
}

export function demoModelStats(model: DemoModel) {
  return meshStats(model.meshes);
}

export function encodeDemoGlb(model: DemoModel): Buffer {
  return encodeGlb(model.meshes);
}

/** 업로드 테스트용 샘플 ASCII STL / OBJ / DXF 생성 */
export function sampleFiles(): { name: string; mime: string; content: string }[] {
  const stl = `solid eum-bracket
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 0.12 0 0
    vertex 0.12 0.06 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 0.12 0.06 0
    vertex 0 0.06 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 0.008
    vertex 0.12 0.06 0.008
    vertex 0.12 0 0.008
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 0.008
    vertex 0 0.06 0.008
    vertex 0.12 0.06 0.008
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 0 0
    vertex 0 0 0.008
    vertex 0.12 0 0.008
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 0 0
    vertex 0.12 0 0.008
    vertex 0.12 0 0
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 0.06 0
    vertex 0.12 0.06 0
    vertex 0.12 0.06 0.008
  endloop
endfacet
facet normal 0 1 0
  outer loop
    vertex 0 0.06 0
    vertex 0.12 0.06 0.008
    vertex 0 0.06 0.008
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex 0.12 0 0
    vertex 0.12 0.06 0.008
    vertex 0.12 0.06 0
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex 0.12 0 0
    vertex 0.12 0 0.008
    vertex 0.12 0.06 0.008
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex 0 0 0
    vertex 0 0.06 0
    vertex 0 0.06 0.008
  endloop
endfacet
facet normal 1 0 0
  outer loop
    vertex 0 0 0
    vertex 0 0.06 0.008
    vertex 0 0 0.008
  endloop
endfacet
endsolid eum-bracket`;

  const obj = `# EUM 3D SHOWROOM PRO sample bracket
o Housing
v 0 0 0
v 0.16 0 0
v 0.16 0.08 0
v 0 0.08 0
v 0 0 0.02
v 0.16 0 0.02
v 0.16 0.08 0.02
v 0 0.08 0.02
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
o Cover
v 0.02 0.02 0.02
v 0.14 0.02 0.02
v 0.14 0.06 0.02
v 0.02 0.06 0.02
v 0.02 0.02 0.03
v 0.14 0.02 0.03
v 0.14 0.06 0.03
v 0.02 0.06 0.03
f 9 10 11 12
f 13 16 15 14
f 9 13 14 10
f 10 14 15 11
f 11 15 16 12
f 12 16 13 9
o Shaft
v 0.08 0.04 0.03
v 0.08 0.04 0.09
f 17 18 18
`;

  const dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1027
9
$INSUNITS
70
4
9
$EXTMIN
10
0
20
0
9
$EXTMAX
10
240
20
120
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
OUTLINE
0
LAYER
2
HOLES
0
LAYER
2
CENTER
0
LAYER
2
DIM
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
OUTLINE
90
4
70
1
10
20
20
20
10
220
20
20
10
220
20
100
10
20
20
100
0
CIRCLE
8
HOLES
10
60
20
60
40
10
0
CIRCLE
8
HOLES
10
120
20
60
40
10
0
CIRCLE
8
HOLES
10
180
20
60
40
10
0
LINE
8
CENTER
10
40
20
60
11
80
21
60
0
LINE
8
DIM
10
20
20
110
11
220
21
110
0
TEXT
8
DIM
1
PLATE-240x120
10
24
20
112
40
6
0
ENDSEC
0
EOF
`;
  return [
    { name: "sample-bracket.stl", mime: "model/stl", content: stl },
    { name: "sample-housing.obj", mime: "model/obj", content: obj },
    { name: "sample-plate.dxf", mime: "image/vnd.dxf", content: dxf },
  ];
}
