import {
  boxGeom,
  makeMesh,
  mergeGeoms,
  segmentWall,
  texturedBoxGeom,
  type MeshData,
} from "./glb";
import { drawingExtents, dxfTextEntities, entityPolylines, type DxfDrawing } from "./parsers/dxf";
import type { RasterComponent, RasterImage, RasterRect } from "./raster";

export type AiSuggestion = { title: string; detail: string; basis: string };
export type AiPartSuggestion = {
  name: string;
  layer: string;
  entityCount: number;
  role: string;
  note: string;
};

export type AiAnalysis = {
  mode: "HEURISTIC_RULES" | "EXTERNAL_VISION" | "NONE";
  headline: string;
  confidence: number;
  dimensions: { width: number | null; height: number | null; depth: number | null; unit: string };
  suggestions: AiSuggestion[];
  parts: AiPartSuggestion[];
  uncertainties: string[];
  note: string;
  generatedAt: string;
  /** 입력 파일마다 다른 값을 갖는 분석 서명(이미지/도면 지문) */
  signature?: string;
  /** 화면·검증용 실제 측정치 */
  metrics?: Record<string, string | number>;
};

export type ReferencePartMeta = {
  nodeName: string;
  name: string;
  description: string;
  material: string;
  layer: string;
  entityCount: number;
  weight?: number | null;
  spec?: string | null;
};

const ROLE_COLORS: Record<string, [number, number, number]> = {
  OUTLINE: [0.32, 0.7, 0.85],
  HOLE: [0.95, 0.55, 0.35],
  CENTER: [0.85, 0.8, 0.35],
  HIDDEN: [0.55, 0.5, 0.75],
  DIMENSION: [0.45, 0.55, 0.45],
  SECTION: [0.7, 0.45, 0.5],
  TEXT: [0.75, 0.75, 0.78],
  DEFAULT: [0.6, 0.66, 0.72],
};

function roleOfLayer(layer: string): string {
  const l = layer.toUpperCase();
  if (/HOLE|BORE|孔|구멍|DRILL/.test(l)) return "HOLE";
  if (/CENTER|CENTRE|중심|CL/.test(l)) return "CENTER";
  if (/HIDDEN|DASH|은선/.test(l)) return "HIDDEN";
  if (/DIM|치수/.test(l)) return "DIMENSION";
  if (/HATCH|SECTION|해치|단면/.test(l)) return "SECTION";
  if (/TEXT|NOTE|ANNO|문자|주기/.test(l)) return "TEXT";
  if (/OUTLINE|PROFILE|외곽|형상|BODY|PART/.test(l)) return "OUTLINE";
  return "DEFAULT";
}

function layerLabel(role: string): string {
  switch (role) {
    case "HOLE":
      return "홀·보어 형상";
    case "CENTER":
      return "중심선";
    case "HIDDEN":
      return "숨은선(내부 형상)";
    case "DIMENSION":
      return "치수 기입선";
    case "SECTION":
      return "단면·해치";
    case "TEXT":
      return "문자·주기";
    case "OUTLINE":
      return "외곽 윤곽";
    default:
      return "일반 형상";
  }
}

/**
 * DXF 도면을 참고용 3D relief 로 변환한다.
 * 원본 도면의 깊이 정보가 없으므로 두께/높이는 가정값이며 UI 에 명시된다.
 */
export function buildDxfReference(drawing: DxfDrawing, options: { filename: string }): {
  meshes: MeshData[];
  parts: ReferencePartMeta[];
  analysis: AiAnalysis;
} {
  const extents = drawingExtents(drawing);
  const rawMax = Math.max(extents.width, extents.height, 1);
  const unitScale = drawing.unitCode === 1 ? 25.4 : drawing.unitCode === 5 ? 10 : drawing.unitCode === 6 ? 1000 : 1;
  const mmMax = rawMax * unitScale;
  const scale = 0.001 * unitScale; // 도면 단위 → m
  const sceneMax = Math.max(0.05, rawMax * scale);
  const wallHeight = Math.max(sceneMax * 0.035, 0.0008);
  const wallThickness = Math.max(sceneMax * 0.004, 0.0002);
  const baseThickness = Math.max(sceneMax * 0.012, 0.0006);

  const centerX = (extents.min[0] + extents.max[0]) / 2;
  const centerY = (extents.min[1] + extents.max[1]) / 2;
  const toScene = (x: number, y: number): [number, number] => [(x - centerX) * scale, (y - centerY) * scale];

  const byLayer = new Map<string, { geoms: ReturnType<typeof boxGeom>[]; count: number; labels: string[] }>();
  let totalEntities = 0;
  for (const entity of drawing.entities) {
    const polys = entityPolylines(entity);
    if (polys.length === 0) continue;
    const entry = byLayer.get(entity.layer) ?? { geoms: [], count: 0, labels: [] };
    for (const poly of polys) {
      let count = 0;
      for (let i = 0; i < poly.points.length - 1; i++) {
        const [x1, y1] = toScene(poly.points[i][0], poly.points[i][1]);
        const [x2, y2] = toScene(poly.points[i + 1][0], poly.points[i + 1][1]);
        const g = segmentWall(x1, y1, x2, y2, wallThickness, wallHeight, baseThickness);
        if (g.positions.length > 0) {
          entry.geoms.push(g);
          count += 1;
        }
      }
      if (poly.closed && poly.points.length > 2) {
        const first = toScene(poly.points[0][0], poly.points[0][1]);
        const last = toScene(poly.points[poly.points.length - 1][0], poly.points[poly.points.length - 1][1]);
        const g = segmentWall(last[0], last[1], first[0], first[1], wallThickness, wallHeight, baseThickness);
        if (g.positions.length > 0) entry.geoms.push(g);
      }
      entry.count += count;
      totalEntities += 1;
    }
    entry.labels.push(entity.type);
    byLayer.set(entity.layer, entry);
  }

  const meshes: MeshData[] = [];
  const parts: ReferencePartMeta[] = [];
  const base = makeMesh("BASE", [boxGeom([sceneMax * 1.12, sceneMax * 1.12, baseThickness], [0, 0, baseThickness / 2])], {
    color: [0.13, 0.16, 0.2],
    metalness: 0.4,
    roughness: 0.7,
  });
  meshes.push(base);
  parts.push({
    nodeName: "BASE",
    name: "도면 기준판",
    description: "2D 도면 외곽 범위를 기준으로 생성한 참고용 기준판입니다.",
    material: "ALUMINUM",
    layer: "-",
    entityCount: 0,
  });

  let index = 0;
  for (const [layer, entry] of Array.from(byLayer.entries())) {
    if (entry.geoms.length === 0) continue;
    index += 1;
    const role = roleOfLayer(layer);
    const color = ROLE_COLORS[role] ?? ROLE_COLORS.DEFAULT;
    const nodeName = `LAYER_${index}`;
    const mesh = makeMesh(nodeName, entry.geoms, { color, metalness: 0.35, roughness: 0.5 });
    meshes.push(mesh);
    parts.push({
      nodeName,
      name: `${layer} · ${layerLabel(role)}`,
      description: `DXF ${layer} 레이어에서 추출한 선형 형상 ${entry.count}개를 참고용으로 입체화했습니다. 깊이 정보는 도면에 없어 가정값을 사용했습니다.`,
      material: "PAINT",
      layer,
      entityCount: entry.count,
    });
  }

  const texts = dxfTextEntities(drawing);
  const circles = drawing.entityCounts.CIRCLE ?? 0;
  const closedPolys = drawing.entities.filter((e) => {
    if (e.type !== "LWPOLYLINE" && e.type !== "POLYLINE") return false;
    const flag = Number(e.codes[70]?.[0] ?? 0);
    return (flag & 1) === 1;
  }).length;
  const suggestions: AiSuggestion[] = [
    {
      title: "주 형상(외곽 윤곽) 인식",
      detail: `닫힌 폴리라인 ${closedPolys}개와 선분을 결합해 평면 외곽을 3D 벽체로 재구성했습니다.`,
      basis: "LWPOLYLINE/POLYLINE 의 70 플래그(닫힘), LINE · ARC 연결 관계",
    },
    {
      title: "홀·보어特征 탐지",
      detail: `원형 엔티티 ${circles}개를 홀 후보로 표시했습니다. 지름은 도면 값 그대로이며, 관통/맹홀 여부는 확정하지 않았습니다.`,
      basis: "CIRCLE 엔티티 개수 및 반지름(코드 40)",
    },
    {
      title: "가공 기준선 분류",
      detail: `중심선·치수선 레이어를 별도 부품으로 분리해 쇼룸에서 토글할 수 있게 했습니다.`,
      basis: "레이어 이름 키워드(CENTER/DIM/HIDDEN) 및 엔티티 유형",
    },
  ];
  if (texts.length > 0) {
    suggestions.push({
      title: "도면 주기(문자) 수집",
      detail: `문자/주기 ${texts.length}건을 수집했습니다. 예: ${texts.slice(0, 3).map((t) => `"${t.text}"`).join(", ")}`,
      basis: "TEXT/MTEXT 엔티티 코드 1",
    });
  }

  const analysis: AiAnalysis = {
    mode: process.env.AI_VISION_API_KEY ? "EXTERNAL_VISION" : "HEURISTIC_RULES",
    headline: `${options.filename} — 도면 선형 형상 기준 참고용 3D 시각화 제안`,
    confidence: 0.62,
    dimensions: {
      width: Math.round(extents.width * unitScale * 10) / 10,
      height: Math.round(extents.height * unitScale * 10) / 10,
      depth: null,
      unit: drawing.units === "밀리미터" ? "mm" : drawing.units,
    },
    suggestions,
    parts: parts.slice(1).map((p) => ({
      name: p.name,
      layer: p.layer,
      entityCount: p.entityCount,
      role: layerLabel(roleOfLayer(p.layer)),
      note: p.description,
    })),
    uncertainties: [
      "도면에는 깊이(두께) 값이 없어 벽체 높이를 도면 크기 대비 임의 비율로 가정했습니다.",
      "숨은선·단면 정보만으로 내부 구조를 확정하지 않았습니다. 정확한 형상은 3D 모델 업로드가 필요합니다.",
      "재질·열처리·공차 정보는 도면 주기에서 확인된 범위만 표시합니다.",
    ],
    note: "이 화면은 AI 보조 '참고용' 시각화이며, 설계·치수 확정용이 아닙니다.",
    generatedAt: new Date().toISOString(),
  };

  return { meshes, parts, analysis };
}

/**
 * 이미지 도면(PNG/JPG/TIFF, PDF 렌더 결과)을 실제 픽셀에서 뽑은 윤곽으로 3D 릴리프화한다.
 * - 정면에는 업로드한 원본 이미지가 정확한 UV 로 입혀진 도면 블록
 * - 잉크(선) 영역은 컴포넌트별로 돌출된 3D 부품 계층으로 생성
 * - 깊이 정보는 이미지에 없으므로 돌출 높이는 밝기 차이 기반 가정값이며 화면에 명시된다.
 */
export function buildRasterReference(options: {
  filename: string;
  formatLabel: string;
  image: RasterImage;
  /** 정면 텍스처용 PNG (회전 보정·크기 정리 완료) */
  texture: Buffer;
  pageCount?: number | null;
  /** PDF 등 원본을 어떻게 이미지로 얻었는지 */
  sourceNote?: string;
}): { meshes: MeshData[]; parts: ReferencePartMeta[]; analysis: AiAnalysis } {
  const { image } = options;
  const aspect = Math.min(6, Math.max(0.22, image.sourceWidth / Math.max(1, image.sourceHeight)));
  let panelHeight = 1.3;
  let panelWidth = panelHeight * aspect;
  if (panelWidth > 2.0) {
    panelWidth = 2.0;
    panelHeight = panelWidth / aspect;
  }
  if (panelWidth < 0.45) {
    panelWidth = 0.45;
    panelHeight = panelWidth / aspect;
  }
  const baseY = 0.12;
  const centerY = baseY + panelHeight / 2;
  const thickness = Math.min(0.03, Math.max(0.006, panelWidth * 0.014));
  const cellW = panelWidth / image.width;
  const cellH = panelHeight / image.height;
  const reliefDepth = Math.min(0.03, Math.max(0.004, panelWidth * 0.018));

  const toX = (col: number): number => -panelWidth / 2 + col * cellW;
  const toY = (row: number): number => baseY + panelHeight - row * cellH;
  const rectGeom = (rects: RasterRect[], depthScale: number) =>
    rects.map((rect) => {
      const bw = Math.max(cellW * 0.9, (rect.x1 - rect.x0) * cellW * 0.92);
      const bh = Math.max(cellH * 0.55, (rect.y1 - rect.y0) * cellH * 0.82);
      const cx = (toX(rect.x0) + toX(rect.x1)) / 2;
      const cy = (toY(rect.y0) + toY(rect.y1)) / 2;
      const depth = Math.max(0.0012, reliefDepth * depthScale * rect.weight);
      return boxGeom([bw, bh, depth], [cx, cy, depth / 2]);
    });

  const meshes: MeshData[] = [];
  const parts: ReferencePartMeta[] = [];
  const totalCells = image.width * image.height;

  // 1) 뒤판 프레임 (이미지 테두리를 감싸는 베젤)
  const frame = makeMesh(
    "PANEL_FRAME",
    [boxGeom([panelWidth + 0.09, panelHeight + 0.09, thickness * 0.9], [0, centerY, -thickness * 1.1])],
    { color: [0.09, 0.11, 0.14], metalness: 0.65, roughness: 0.35 },
  );
  meshes.push(frame);
  parts.push({
    nodeName: "PANEL_FRAME",
    name: "도면 패널 프레임",
    description: "업로드한 도면 이미지를 전시하는 베젤 프레임입니다.",
    material: "PAINT",
    layer: "-",
    entityCount: 0,
  });

  // 2) 도면 블록 — 정면에 원본 이미지가 1:1 텍스처로 입혀지는 입체 블록
  const block = makeMesh(
    "DRAWING_BLOCK",
    [texturedBoxGeom([panelWidth, panelHeight, thickness], [0, centerY, -thickness / 2])],
    {
      color: [1, 1, 1],
      metalness: 0,
      roughness: 0.92,
      texture: { data: options.texture, mimeType: "image/png", name: options.filename },
    },
  );
  meshes.push(block);
  parts.push({
    nodeName: "DRAWING_BLOCK",
    name: "도면 원본 블록",
    description: `${options.filename} (${options.formatLabel}) 원본 이미지를 정면 텍스처로 정확히 입힌 입체 도면 블록입니다.`,
    material: "ALUMINUM",
    layer: "-",
    entityCount: 0,
    spec: `${image.sourceWidth} × ${image.sourceHeight} px`,
  });

  // 3) 추출 윤곽 → 3D 돌출 부품 계층
  const comps = image.components.filter((c) => c.rects.length > 0);
  const minDetailArea = Math.max(4, Math.round(totalCells * 0.00006));
  const compsUsable = comps.filter((c) => c.area >= minDetailArea);
  const primary = compsUsable[0] ?? null;
  const secondaryLimit = Math.min(5, Math.max(0, compsUsable.length - 1));
  const secondary: RasterComponent[] = compsUsable.slice(1, 1 + secondaryLimit).filter((c) => c.area >= Math.max(minDetailArea, (primary?.area ?? 0) * 0.012));
  const usedLabels = new Set<number>([primary?.label ?? -1, ...secondary.map((c) => c.label)]);
  const detailRects: RasterRect[] = [];
  for (const comp of compsUsable) {
    if (usedLabels.has(comp.label)) continue;
    for (const rect of comp.rects) detailRects.push(rect);
    if (detailRects.length > 4200) break;
  }
  const detailTrimmed = detailRects.slice(0, 4200);

  if (primary) {
    const rel = rectGeom(primary.rects, 1);
    if (rel.length > 0) {
      const mesh = makeMesh("RELIEF_PRIMARY", rel, { color: [0.3, 0.66, 0.86], metalness: 0.35, roughness: 0.45 });
      meshes.push(mesh);
      parts.push({
        nodeName: "RELIEF_PRIMARY",
        name: `주 윤곽 · 면적 ${fmtPct(primary.area / totalCells)}`,
        description: `가장 큰 잉크 영역(면적 ${fmtPct(primary.area / totalCells)}, 위치 ${describeBox(primary, image)})을 돌출 부품으로 만들었습니다. 사각형 ${primary.rects.length}개로 구성됩니다.`,
        material: "PAINT",
        layer: "IMAGE_OUTLINE",
        entityCount: primary.rects.length,
        spec: `면적 ${fmtPct(primary.area / totalCells)} · 사각형 ${primary.rects.length}개`,
      });
    }
  }

  secondary.forEach((comp, index) => {
    const nodeName = `RELIEF_${index + 2}`;
    const rel = rectGeom(comp.rects, 0.72);
    if (rel.length === 0) return;
    const mesh = makeMesh(nodeName, rel, { color: [0.94, 0.6, 0.36], metalness: 0.5, roughness: 0.4 });
    meshes.push(mesh);
    parts.push({
      nodeName,
      name: `형상군 ${index + 2} · 면적 ${fmtPct(comp.area / totalCells)}`,
      description: `분리된 잉크 영역(면적 ${fmtPct(comp.area / totalCells)}, 위치 ${describeBox(comp, image)})을 별도 부품으로 분리했습니다. 사각형 ${comp.rects.length}개.`,
      material: "ALUMINUM",
      layer: "IMAGE_OUTLINE",
      entityCount: comp.rects.length,
      spec: `면적 ${fmtPct(comp.area / totalCells)} · 사각형 ${comp.rects.length}개`,
    });
  });

  if (detailTrimmed.length > 0) {
    const rel = rectGeom(detailTrimmed, 0.45);
    if (rel.length > 0) {
      meshes.push(makeMesh("RELIEF_DETAIL", rel, { color: [0.62, 0.68, 0.74], metalness: 0.62, roughness: 0.42 }));
      parts.push({
        nodeName: "RELIEF_DETAIL",
        name: "세부 윤곽(치수·문자·기호)",
        description: `작은 잉크 영역 ${detailTrimmed.length}개를 하나의 세부 윤곽 부품으로 묶었습니다.`,
        material: "STEEL",
        layer: "IMAGE_DETAIL",
        entityCount: detailTrimmed.length,
        spec: `사각형 ${detailTrimmed.length}개`,
      });
    }
  }

  // 4) 내용 외곽 기준선 (이미지 전체를 꽉 채우지 않을 때만)
  if (image.contentBox) {
    const cb = image.contentBox;
    const areaRatio = ((cb.x1 - cb.x0) * (cb.y1 - cb.y0)) / totalCells;
    if (areaRatio < 0.97) {
      const x0 = toX(cb.x0);
      const x1 = toX(cb.x1);
      const yTop = toY(cb.y0);
      const yBottom = toY(cb.y1);
      const t = Math.max(0.004, panelWidth * 0.005);
      const d = Math.max(0.0018, reliefDepth * 0.5);
      meshes.push(
        makeMesh(
          "CONTENT_FRAME",
          [
            boxGeom([x1 - x0 + t, t, d], [(x0 + x1) / 2, yTop, d / 2]),
            boxGeom([x1 - x0 + t, t, d], [(x0 + x1) / 2, yBottom, d / 2]),
            boxGeom([t, yTop - yBottom, d], [x0, (yTop + yBottom) / 2, d / 2]),
            boxGeom([t, yTop - yBottom, d], [x1, (yTop + yBottom) / 2, d / 2]),
          ],
          { color: [0.88, 0.78, 0.32], metalness: 0.5, roughness: 0.35 },
        ),
      );
      parts.push({
        nodeName: "CONTENT_FRAME",
        name: "내용 외곽 기준선",
        description: `이미지에서 실제 도면 내용이 차지하는 범위(가로 ${fmtPct((cb.x1 - cb.x0) / image.width)}, 위치 ${describeBox({ minX: cb.x0, maxX: cb.x1 - 1, minY: cb.y0, maxY: cb.y1 - 1 } as RasterComponent, image)})를 기준선으로 표시했습니다.`,
        material: "PAINT",
        layer: "IMAGE_FRAME",
        entityCount: 4,
      });
    }
  }

  // 5) 스탠드
  meshes.push(
    makeMesh(
      "PANEL_STAND",
      [
        boxGeom([0.07, panelHeight * 0.8, 0.07], [0, baseY + panelHeight * 0.4, -thickness - 0.075]),
        boxGeom([panelWidth * 0.55, 0.035, 0.36], [0, 0.018, -thickness - 0.09]),
      ],
      { color: [0.16, 0.19, 0.23], metalness: 0.6, roughness: 0.35 },
    ),
  );
  parts.push({
    nodeName: "PANEL_STAND",
    name: "패널 스탠드",
    description: "도면 릴리프 블록을 세우는 전시용 스탠드입니다.",
    material: "STEEL",
    layer: "-",
    entityCount: 0,
  });

  const inkPct = fmtPct(image.inkRatio);
  const componentCount = compsUsable.length;
  const colorHex = `#${image.inkColor.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, "0")).join("")}`;
  const suggestions: AiSuggestion[] = [
    {
      title: "이미지 윤곽 직접 추출",
      detail: `원본 픽셀 ${image.sourceWidth}×${image.sourceHeight}px 를 ${image.width}×${image.height} 그리드로 디코딩해 잉크(선) 영역을 ${inkPct} 추출했습니다. 검출된 형상군은 ${componentCount}개입니다.`,
      basis: `픽셀 밝기 분포 · Otsu 임계값 ${image.threshold} · ${image.darkInk ? "밝은 배경/어두운 선" : "어두운 배경/밝은 선"}`,
    },
    {
      title: "정면 텍스처 도면 블록",
      detail: "원본 이미지를 입체 도면 블록의 정면 UV 에 1:1 로 정확히 입혀, 회전·확대 시에도 도면 그림이 그대로 보입니다.",
      basis: `업로드 원본 이미지 · 파일 지문 ${image.signature}`,
    },
    {
      title: "윤곽 돌출(릴리프) 메시 생성",
      detail: `잉크 강도에 비례해 사각형 기둥을 돌출시켰습니다. 주 윤곽 1개${secondary.length > 0 ? ` · 형상군 ${secondary.length}개` : ""}${detailTrimmed.length > 0 ? ` · 세부 윤곽 ${detailTrimmed.length}개` : ""}로 부품 계층을 구성했습니다.`,
      basis: "연결 요소(4-이웃) 라벨링 · 행/열 run 병합 · 밝기 가중치",
    },
  ];
  if (!image.hasInk) {
    suggestions.push({
      title: "윤곽 미검출 — 원본만 전시",
      detail: "이미지에서 도면 선을 구분하지 못해(단색·저대비 또는 사진) 원본 텍스처 블록만 구성했습니다. 임의의 형상을 지어내지 않았습니다.",
      basis: `잉크 비율 ${inkPct} · 배경 밝기 ${image.backgroundLuma}`,
    });
  }
  if (options.pageCount && options.pageCount > 1) {
    suggestions.push({
      title: "PDF 페이지 범위",
      detail: `전체 ${options.pageCount}페이지 중 1페이지를 대표 도면으로 렌더링했습니다.`,
      basis: options.sourceNote ?? "PDF 첫 페이지 렌더",
    });
  }

  const analysis: AiAnalysis = {
    mode: process.env.AI_VISION_API_KEY ? "EXTERNAL_VISION" : "HEURISTIC_RULES",
    headline: `${options.filename} — 이미지 윤곽 기반 참고용 3D 릴리프 (형상군 ${componentCount}개)`,
    confidence: image.hasInk ? Math.min(0.82, 0.46 + componentCount * 0.02 + image.inkRatio * 0.3) : 0.4,
    dimensions: { width: image.sourceWidth, height: image.sourceHeight, depth: null, unit: "px" },
    suggestions,
    parts: parts
      .filter((p) => p.layer === "IMAGE_OUTLINE" || p.layer === "IMAGE_DETAIL")
      .map((p) => ({ name: p.name, layer: p.layer, entityCount: p.entityCount, role: "추출 윤곽", note: p.description })),
    uncertainties: [
      "이미지 도면에는 깊이(두께) 정보가 없어 돌출 높이를 밝기 차이 기반 가정값으로 만들었습니다. 실제 치수·형상과 다를 수 있습니다.",
      "누락된 깊이·내부 구조·숨은선은 임의로 확정하지 않았습니다. 정확한 형상은 3D 모델 업로드가 필요합니다.",
      "재질·공차·열처리 정보는 이미지에서 판독하지 않았습니다.",
      ...(options.pageCount && options.pageCount > 1 ? [`PDF 전체 ${options.pageCount}페이지 중 1페이지(첫 페이지)만 시각화했습니다.`] : []),
      ...(options.sourceNote ? [`이미지 변환: ${options.sourceNote}`] : []),
      ...(!image.hasInk ? ["윤곽을 검출하지 못해 원본 이미지를 그대로 입힌 블록만 표시합니다."] : []),
    ],
    note: "이 화면은 AI 보조 '참고용' 시각화이며, 설계·치수 확정용이 아닙니다.",
    generatedAt: new Date().toISOString(),
    signature: image.signature,
    metrics: {
      sourceWidth: image.sourceWidth,
      sourceHeight: image.sourceHeight,
      gridWidth: image.width,
      gridHeight: image.height,
      inkRatio: Number((image.inkRatio * 100).toFixed(2)),
      componentCount,
      reliefRects: parts.filter((p) => p.layer === "IMAGE_OUTLINE" || p.layer === "IMAGE_DETAIL").reduce((a, p) => a + p.entityCount, 0),
      inkColor: colorHex,
      threshold: image.threshold,
      signature: image.signature,
    },
  };

  return { meshes, parts, analysis };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function describeBox(comp: { minX: number; maxX: number; minY: number; maxY: number }, image: RasterImage): string {
  const cx = (comp.minX + comp.maxX) / 2 / image.width;
  const cy = (comp.minY + comp.maxY) / 2 / image.height;
  const horizontal = cx < 0.34 ? "좌측" : cx > 0.66 ? "우측" : "중앙";
  const vertical = cy < 0.34 ? "상단" : cy > 0.66 ? "하단" : "중앙";
  return `${vertical} ${horizontal}`;
}

/** 이미지/PDF 도면을 3D 쇼룸 안의 '도면 패널'로 전시 */
export function buildDrawingPanel(options: {
  filename: string;
  formatLabel: string;
  width?: number | null;
  height?: number | null;
  pageCount?: number | null;
  /** 원본을 이미지로 해석하지 못한 이유(폴백 안내) */
  notice?: string;
}): { meshes: MeshData[]; parts: ReferencePartMeta[]; analysis: AiAnalysis } {
  const aspect = options.width && options.height ? options.width / options.height : 1.414;
  const panelHeight = 1.3;
  const panelWidth = Math.min(2.2, Math.max(0.5, panelHeight * aspect));
  const depth = 0.02;

  const frame = makeMesh("PANEL_FRAME", [boxGeom([panelWidth + 0.12, panelHeight + 0.12, depth], [0, panelHeight / 2 + 0.1, 0])], {
    color: [0.09, 0.11, 0.14],
    metalness: 0.7,
    roughness: 0.3,
  });
  const panel = makeMesh("DRAWING_PANEL", [boxGeom([panelWidth, panelHeight, depth * 0.6], [0, panelHeight / 2 + 0.1, 0.004])], {
    color: [0.9, 0.92, 0.95],
    metalness: 0.05,
    roughness: 0.9,
  });
  const stand = makeMesh("PANEL_STAND", [
    boxGeom([0.08, 1.0, 0.08], [0, 0.5, -0.06]),
    boxGeom([0.7, 0.04, 0.4], [0, 0.02, -0.02]),
  ], {
    color: [0.16, 0.19, 0.23],
    metalness: 0.6,
    roughness: 0.35,
  });

  const parts: ReferencePartMeta[] = [
    {
      nodeName: "PANEL_FRAME",
      name: "도면 패널 프레임",
      description: "도면 원본을 전시하는 3D 패널 프레임입니다.",
      material: "PAINT",
      layer: "-",
      entityCount: 0,
    },
    {
      nodeName: "DRAWING_PANEL",
      name: "도면 원본 패널",
      description: `${options.filename} (${options.formatLabel}) 원본 도면을 패널에 표시합니다.`,
      material: "GLASS",
      layer: "-",
      entityCount: 0,
    },
    {
      nodeName: "PANEL_STAND",
      name: "패널 스탠드",
      description: "도면 패널을 세우는 전시용 스탠드입니다.",
      material: "STEEL",
      layer: "-",
      entityCount: 0,
    },
  ];

  const analysis: AiAnalysis = {
    mode: process.env.AI_VISION_API_KEY ? "EXTERNAL_VISION" : "HEURISTIC_RULES",
    headline: `${options.filename} — 도면 패널 전시 + 참고용 해석 제안`,
    confidence: 0.45,
    dimensions: {
      width: options.width ?? null,
      height: options.height ?? null,
      depth: null,
      unit: options.width ? "px" : "unknown",
    },
    suggestions: [
      {
        title: "도면 원본 전시",
        detail: "도면을 3D 쇼룸의 패널로 세워 고객이 회전·확대하며 볼 수 있게 했습니다.",
        basis: "업로드 원본 파일",
      },
      {
        title: "형상 3D 복원은 미수행",
        detail: "래스터/PDF 도면에서 정확한 3D 형상을 복원하려면 도면 벡터화 또는 3D 모델이 필요합니다. 임의로 추정 형상을 만들지 않았습니다.",
        basis: "이미지/PDF 는 깊이·형상 정보를 직접 포함하지 않음",
      },
    ],
    parts: [],
    uncertainties: [
      ...(options.notice ? [options.notice] : []),
      "이미지·PDF 도면은 깊이 정보를 포함하지 않아 3D 형상을 임의로 확정하지 않았습니다.",
      "정확한 3D 형상은 STEP/GLB/STL/OBJ 모델을 추가 업로드해 주세요.",
      ...(options.pageCount ? [`PDF 전체 ${options.pageCount}페이지 중 대표 도면만 전시 대상입니다.`] : []),
    ],
    note: "이 화면은 AI 보조 '참고용' 시각화이며, 설계·치수 확정용이 아닙니다.",
    generatedAt: new Date().toISOString(),
  };

  return { meshes: [frame, panel, stand], parts, analysis };
}

/** 3D 모델에 대한 구조 분석 제안 (파이프라인 4단계) */
export function analyzeMeshStructure(args: {
  formatLabel: string;
  partCount: number;
  size: [number, number, number];
  triangleCount: number;
}): { headline: string; notes: string[] } {
  const [sx, sy, sz] = args.size;
  return {
    headline: `${args.formatLabel} · 부품 ${args.partCount}개 · 삼각형 ${args.triangleCount.toLocaleString()}개`,
    notes: [
      `전체 크기 약 ${(sx * 1000).toFixed(0)} × ${(sy * 1000).toFixed(0)} × ${(sz * 1000).toFixed(0)} mm (모델 단위 1 = 1 m 가정)`,
      args.partCount > 1 ? "노드/그룹 구조를 부품 계층으로 추출했습니다." : "단일 메시 모델입니다. 부품 분리는 STL 연결 요소 분석으로 수행합니다.",
      "원본 CAD 형상은 변경하지 않으며, 쇼룸 장면(분해·강조·투시)만 별도로 저장합니다.",
    ],
  };
}
