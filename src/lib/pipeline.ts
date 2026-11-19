import { prisma } from "./db";
import { analyzeFile, formatById } from "./formats";
import { readStored, saveProjectArtifact, saveThumbnail, fileUrl, buildThumbnailSvg } from "./storage";
import { decodeGlb, decodeGltf, encodeGlb, meshStats, optimizeMeshes, partBounds, statsToJson, type MeshData } from "./glb";
import { parseStl } from "./parsers/stl";
import { parseObj } from "./parsers/obj";
import { parseDxf } from "./parsers/dxf";
import { buildDxfReference, buildDrawingPanel, buildRasterReference, analyzeMeshStructure, type AiAnalysis, type ReferencePartMeta } from "./reference";
import { decodeRaster, rasterPreviewPng, rasterThumbJpeg, type RasterImage } from "./raster";
import { renderPdfFirstPage } from "./pdf";
import { industryLabel, materialPreset } from "./constants";
import { guessMaterial, guessMoldRole, guessMotion, inferPartMeta, partDirection } from "./partMeta";
import { buildDefaultSequences } from "./sequences";

export const PIPELINE_STEPS: { step: number; key: string; label: string }[] = [
  { step: 1, key: "UPLOAD", label: "파일 업로드" },
  { step: 2, key: "FORMAT", label: "형식 및 무결성 검사" },
  { step: 3, key: "CLASSIFY", label: "2D/3D 자동 판별" },
  { step: 4, key: "STRUCTURE", label: "부품 구조·계층 분석" },
  { step: 5, key: "CONVERT", label: "모델 변환" },
  { step: 6, key: "GLB", label: "웹 표시용 GLB 생성" },
  { step: 7, key: "OPTIMIZE", label: "메시 최적화" },
  { step: 8, key: "THUMBNAIL", label: "썸네일 생성" },
  { step: 9, key: "SAVE", label: "쇼룸 프로젝트 저장" },
  { step: 10, key: "LAUNCH", label: "3D 뷰어 자동 실행" },
];

export type PipelineOutcome = {
  status: "OK" | "WARN" | "FAILED";
  runId: string;
  stages: { step: number; key: string; label: string; status: string; detail: string | null }[];
};

const RASTER_GRID = 384;

function totalRects(image: RasterImage): number {
  return image.components.reduce((acc, c) => acc + c.rects.length, 0);
}

/** 릴리프 사각형 수가 과도하면 그리드를 낮춰 다시 디코딩한다(이미지마다 다른 결과 유지). */
async function decodeWithBudget(buffer: Buffer): Promise<RasterImage> {
  let image = await decodeRaster(buffer, RASTER_GRID);
  if (totalRects(image) > 6500) image = await decodeRaster(buffer, 232);
  if (totalRects(image) > 12000) image = await decodeRaster(buffer, 160);
  if (totalRects(image) > 16000) image = await decodeRaster(buffer, 128);
  return image;
}

export async function runPipeline(projectId: string): Promise<PipelineOutcome> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { uploads: true, client: true },
  });
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

  await prisma.project.update({ where: { id: projectId }, data: { status: "PROCESSING" } });
  const run = await prisma.pipelineRun.create({
    data: {
      projectId,
      status: "RUNNING",
      stages: {
        create: PIPELINE_STEPS.map((s) => ({ step: s.step, key: s.key, label: s.label, status: "PENDING" })),
      },
    },
  });

  const results: { step: number; key: string; label: string; status: string; detail: string | null }[] = [];
  let failed = false;
  let warned = false;

  async function mark(key: string, status: "RUNNING" | "OK" | "WARN" | "FAILED", detail: string): Promise<void> {
    const stage = PIPELINE_STEPS.find((s) => s.key === key)!;
    const existing = await prisma.pipelineStage.findFirst({ where: { runId: run.id, key } });
    if (existing) {
      await prisma.pipelineStage.update({
        where: { id: existing.id },
        data: {
          status,
          detail,
          startedAt: status === "RUNNING" ? new Date() : existing.startedAt,
          finishedAt: status === "RUNNING" ? null : new Date(),
        },
      });
    }
    if (status !== "RUNNING") {
      results.push({ step: stage.step, key, label: stage.label, status, detail });
      if (status === "FAILED") failed = true;
      if (status === "WARN") warned = true;
    }
  }

  const finish = async (): Promise<PipelineOutcome> => {
    const status: PipelineOutcome["status"] = failed ? "FAILED" : warned ? "WARN" : "OK";
    await prisma.pipelineRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date() } });
    const stages = await prisma.pipelineStage.findMany({ where: { runId: run.id }, orderBy: { step: "asc" } });
    return {
      status,
      runId: run.id,
      stages: stages.map((s) => ({ step: s.step, key: s.key, label: s.label, status: s.status, detail: s.detail })),
    };
  };

  // 1. 업로드 확인
  await mark("UPLOAD", "RUNNING", "");
  if (project.uploads.length === 0) {
    await mark("UPLOAD", "FAILED", "업로드된 파일이 없습니다.");
    for (const s of PIPELINE_STEPS.filter((s) => s.step > 1)) await mark(s.key, "WARN", "이전 단계 실패로 건너뜀");
    await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED" } });
    return finish();
  }
  const totalSize = project.uploads.reduce((a, u) => a + u.size, 0);
  await mark("UPLOAD", "OK", `${project.uploads.length}개 파일 · ${(totalSize / 1024 / 1024).toFixed(2)} MB 저장 완료`);

  // 2. 형식 및 무결성 (우선순위: 내장 3D 메시 → DXF → 2D 이미지/PDF → 외부 변환 필요)
  await mark("FORMAT", "RUNNING", "");
  const rank = (u: (typeof project.uploads)[number]) => {
    const f = formatById(u.detectedFormat);
    if (!f) return 99;
    if (["GLB", "GLTF", "STL", "OBJ"].includes(f.id)) return 0;
    if (f.id === "DXF") return 1;
    if (["PNG", "JPG", "TIFF", "PDF"].includes(f.id)) return 2;
    if (f.id === "DWG") return 3;
    return 4;
  };
  const sorted = [...project.uploads].sort((a, b) => rank(a) - rank(b) || b.size - a.size);
  let chosen = sorted[0];
  let analysis = analyzeFile(await readStored(chosen.storedPath).catch(() => Buffer.alloc(0)), chosen.originalName);
  if (analysis.integrity === "FAILED") {
    const fallback = sorted.find((u) => u.detectedFormat !== chosen.detectedFormat);
    if (fallback) {
      chosen = fallback;
      analysis = analyzeFile(await readStored(chosen.storedPath).catch(() => Buffer.alloc(0)), chosen.originalName);
    }
  }
  const formatIssues = analysis.issues.join(" / ");
  if (analysis.integrity === "FAILED") {
    await mark("FORMAT", "FAILED", formatIssues || "파일을 해석할 수 없습니다.");
    for (const s of PIPELINE_STEPS.filter((s) => s.step > 2)) await mark(s.key, "WARN", "형식 검사 실패로 건너뜀");
    await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED" } });
    return await finish();
  }
  await mark(
    "FORMAT",
    analysis.integrity === "WARNING" ? "WARN" : "OK",
    `${analysis.formatLabel} · ${(analysis.size / 1024).toFixed(1)} KB · SHA-256 ${analysis.sha256.slice(0, 12)}…${formatIssues ? ` · ${formatIssues}` : ""}`,
  );

  // 3. 2D/3D 판별
  await mark("CLASSIFY", "RUNNING", "");
  const format = formatById(analysis.formatId);
  const sourceType = analysis.kind === "2D" ? "2D" : analysis.kind === "3D" ? "3D" : "UNKNOWN";
  const isDrawing = analysis.kind === "2D";
  if (sourceType === "UNKNOWN" || !format) {
    await mark("CLASSIFY", "FAILED", "2D/3D 를 판별할 수 없는 형식입니다.");
    await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED" } });
    return await finish();
  }
  await mark("CLASSIFY", "OK", `${analysis.formatLabel} → ${sourceType === "2D" ? "2D 도면" : "3D 모델"} (신뢰도 ${Math.round(analysis.confidence * 100)}%)`);

  // 4. 구조 분석
  await mark("STRUCTURE", "RUNNING", "");
  const buffer = await readStored(chosen.storedPath);
  let meshes: MeshData[] = [];
  let referenceParts: ReferencePartMeta[] = [];
  let aiAnalysis: AiAnalysis | null = null;
  let structureDetail = "";
  let renderMode = "MESH_3D";
  let convertGuidance = "";
  let needsExternal = false;
  let referenceImageUrl: string | null = null;
  /** 2D 도면을 실제 이미지로 확보한 경우(썸네일 미리보기·텍스처) */
  let referencePreview: Buffer | null = null;

  try {
    if (["GLB", "GLTF"].includes(analysis.formatId)) {
      const decoded = analysis.formatId === "GLB" ? decodeGlb(buffer) : decodeGltf(buffer);
      meshes = decoded.meshes;
      const stats = meshStats(meshes);
      const notes = analyzeMeshStructure({
        formatLabel: analysis.formatLabel,
        partCount: meshes.length,
        size: stats.size,
        triangleCount: stats.triangleCount,
      });
      aiAnalysis = {
        mode: "NONE",
        headline: notes.headline,
        confidence: 1,
        dimensions: { width: Math.round(stats.size[0] * 1000), height: Math.round(stats.size[1] * 1000), depth: Math.round(stats.size[2] * 1000), unit: "mm" },
        suggestions: notes.notes.map((n) => ({ title: "구조 분석", detail: n, basis: "glTF 노드/메시 계층" })),
        parts: [],
        uncertainties: [],
        note: "3D 모델에서 직접 추출한 구조 정보입니다.",
        generatedAt: new Date().toISOString(),
      };
      structureDetail = notes.headline;
    } else if (analysis.formatId === "STL") {
      const parsed = parseStl(buffer);
      meshes = parsed.meshes;
      const stats = meshStats(meshes);
      structureDetail = `STL 연결 요소 분석 · 부품 ${meshes.length}개 · 삼각형 ${stats.triangleCount.toLocaleString()}개`;
      aiAnalysis = {
        mode: "NONE",
        headline: structureDetail,
        confidence: 0.9,
        dimensions: { width: Math.round(stats.size[0] * 1000), height: Math.round(stats.size[1] * 1000), depth: Math.round(stats.size[2] * 1000), unit: "mm" },
        suggestions: [
          { title: "연결 요소 기반 부품 분리", detail: "삼각형 연결 관계를 따라 부품을 자동 분리했습니다.", basis: "STL 정점 공유 그래프" },
        ],
        parts: [],
        uncertainties: ["STL 은 재질·부품명 정보를 포함하지 않아 재질은 추정값입니다."],
        note: "STL 메시를 분석한 결과입니다.",
        generatedAt: new Date().toISOString(),
      };
    } else if (analysis.formatId === "OBJ") {
      const parsed = parseObj(buffer);
      meshes = parsed.meshes;
      const stats = meshStats(meshes);
      structureDetail = `OBJ 그룹 ${meshes.length}개 · 정점 ${stats.vertexCount.toLocaleString()}개`;
      aiAnalysis = {
        mode: "NONE",
        headline: structureDetail,
        confidence: 0.95,
        dimensions: { width: Math.round(stats.size[0] * 1000), height: Math.round(stats.size[1] * 1000), depth: Math.round(stats.size[2] * 1000), unit: "mm" },
        suggestions: [{ title: "OBJ 그룹 계층 추출", detail: "o/g 그룹을 쇼룸 부품으로 매핑했습니다.", basis: "OBJ o/g/usemtl 구문" }],
        parts: [],
        uncertainties: [],
        note: "OBJ 메시를 분석한 결과입니다.",
        generatedAt: new Date().toISOString(),
      };
    } else if (analysis.formatId === "DXF") {
      const drawing = parseDxf(buffer);
      if (drawing.entities.length === 0) throw new Error("DXF 엔티티를 찾지 못했습니다.");
      const ref = buildDxfReference(drawing, { filename: chosen.originalName });
      meshes = ref.meshes;
      referenceParts = ref.parts;
      aiAnalysis = ref.analysis;
      renderMode = "AI_REFERENCE_3D";
      structureDetail = `DXF 엔티티 ${drawing.entities.length}개 · 레이어 ${drawing.layers.length}개 · 참고용 3D 형상 생성`;
    } else if (["PNG", "JPG", "TIFF"].includes(analysis.formatId)) {
      const dimensions = analysis.meta as { width?: number; height?: number; pageCount?: number };
      const raster = await decodeWithBudget(buffer);
      const preview = await rasterPreviewPng(buffer);
      const stored = await saveProjectArtifact(projectId, "reference-page-1.png", preview);
      referencePreview = preview;
      referenceImageUrl = `${fileUrl(stored)}?v=${run.id}`;
      const ref = buildRasterReference({
        filename: chosen.originalName,
        formatLabel: analysis.formatLabel,
        image: raster,
        texture: preview,
      });
      meshes = ref.meshes;
      referenceParts = ref.parts;
      aiAnalysis = ref.analysis;
      renderMode = "AI_REFERENCE_3D";
      structureDetail = `이미지 윤곽 분석 · ${raster.width}×${raster.height} 그리드 · 잉크 ${(raster.inkRatio * 100).toFixed(1)}% · 형상군 ${raster.components.length}개 · 참고용 3D 릴리프 ${meshes.length}개 부품`;
      if (!raster.hasInk) {
        await mark("STRUCTURE", "WARN", `${structureDetail} · 윤곽 미검출(원본 텍스처 블록만 표시${dimensions.width ? `, ${dimensions.width}×${dimensions.height}px` : ""})`);
      } else {
        await mark("STRUCTURE", "OK", structureDetail);
      }
    } else if (analysis.formatId === "PDF") {
      const dimensions = analysis.meta as { width?: number; height?: number; pageCount?: number };
      const rendered = await renderPdfFirstPage(buffer);
      if (!rendered) {
        const ref = buildDrawingPanel({
          filename: chosen.originalName,
          formatLabel: analysis.formatLabel,
          width: dimensions.width ?? null,
          height: dimensions.height ?? null,
          pageCount: dimensions.pageCount ?? null,
          notice:
            "서버에 PDF 렌더러(pdftoppm·Ghostscript·python3 등)가 없어 첫 페이지를 이미지로 변환하지 못했습니다. 원본 도면 패널만 표시하며 3D 형상은 만들지 않았습니다. PDF 를 PNG/JPG 로 내보내 다시 업로드하면 3D 릴리프가 생성됩니다.",
        });
        meshes = ref.meshes;
        referenceParts = ref.parts;
        aiAnalysis = ref.analysis;
        renderMode = "AI_REFERENCE_2D";
        structureDetail = `PDF 첫 페이지 렌더 실패 · 원본 도면 패널만 표시`;
        await mark("STRUCTURE", "WARN", `${structureDetail} · PDF 렌더러 미설치`);
      } else {
        const raster = await decodeWithBudget(rendered.png);
        const preview = await rasterPreviewPng(rendered.png);
        const stored = await saveProjectArtifact(projectId, "reference-page-1.png", preview);
        referencePreview = preview;
        referenceImageUrl = `${fileUrl(stored)}?v=${run.id}`;
        const ref = buildRasterReference({
          filename: chosen.originalName,
          formatLabel: analysis.formatLabel,
          image: raster,
          texture: preview,
          pageCount: rendered.pageCount ?? dimensions.pageCount ?? null,
          sourceNote: `${rendered.renderer} 로 첫 페이지를 ${raster.sourceWidth}×${raster.sourceHeight}px PNG 로 렌더`,
        });
        meshes = ref.meshes;
        referenceParts = ref.parts;
        aiAnalysis = ref.analysis;
        renderMode = "AI_REFERENCE_3D";
        structureDetail = `PDF 첫 페이지 렌더(${rendered.renderer}) → 이미지 윤곽 기반 3D 릴리프 · 잉크 ${(raster.inkRatio * 100).toFixed(1)}% · 형상군 ${raster.components.length}개 · 부품 ${meshes.length}개`;
        await mark("STRUCTURE", raster.hasInk ? "OK" : "WARN", structureDetail);
      }
    } else if (analysis.formatId === "DWG") {
      const dimensions = analysis.meta as { width?: number; height?: number; pageCount?: number };
      const ref = buildDrawingPanel({
        filename: chosen.originalName,
        formatLabel: analysis.formatLabel,
        width: dimensions.width ?? null,
        height: dimensions.height ?? null,
        pageCount: dimensions.pageCount ?? null,
        notice:
          "DWG 는 바이너리 형식이라 서버에서 직접 해석하지 못했습니다. 원본 도면 패널만 표시하며 3D 형상은 만들지 않았습니다. DXF 또는 PDF/PNG 로 변환해 다시 업로드하면 윤곽 기반 3D 릴리프가 생성됩니다.",
      });
      meshes = ref.meshes;
      referenceParts = ref.parts;
      aiAnalysis = ref.analysis;
      renderMode = "AI_REFERENCE_2D";
      structureDetail = `2D 도면 패널 구성 · 원본 ${analysis.formatLabel}${dimensions.width ? ` · ${dimensions.width}×${dimensions.height}px` : ""}`;
      await mark("STRUCTURE", "WARN", `${structureDetail} · DWG 직접 해석 미지원(DXF 변환 권장)`);
    } else {
      needsExternal = true;
      convertGuidance = `${analysis.formatLabel} 형식입니다. 형식·메타 분석은 완료했지만, B-Rep 메시 변환은 외부 CAD 변환기(또는 공식 API)가 필요합니다. STEP/GLB/STL/OBJ 로 변환 후 다시 업로드하면 즉시 3D 쇼룸을 만들 수 있습니다.`;
      structureDetail = `${analysis.formatLabel} 메타 분석 완료 · 내장 변환기 미지원`;
      aiAnalysis = {
        mode: "NONE",
        headline: `${analysis.formatLabel} — 외부 변환기 필요`,
        confidence: 0.4,
        dimensions: { width: null, height: null, depth: null, unit: "unknown" },
        suggestions: [],
        parts: [],
        uncertainties: [convertGuidance],
        note: "형식 분석만 수행했으며, 변환된 것처럼 표시하지 않습니다.",
        generatedAt: new Date().toISOString(),
      };
      aiAnalysis.suggestions.push({
        title: "표준 포맷 변환 안내",
        detail: "SolidWorks/Inventor/CATIA/NX/Creo 등은 공식 API·변환기 확보 시 지원 예정입니다.",
        basis: "지원 형식 정책",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "구조 분석 실패";
    await mark("STRUCTURE", "FAILED", message);
    await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED" } });
    return await finish();
  }
  if (!results.some((r) => r.key === "STRUCTURE")) {
    await mark("STRUCTURE", "OK", structureDetail);
  }

  // 5. 변환
  await mark("CONVERT", "RUNNING", "");
  if (needsExternal) {
    await mark("CONVERT", "WARN", convertGuidance);
  } else if (meshes.length > 0) {
    await mark("CONVERT", "OK", `내장 변환기: ${analysis.formatLabel} → glTF 2.0 메시 (${meshes.length}개 부품)`);
  } else {
    await mark("CONVERT", "WARN", "변환할 메시가 없습니다.");
  }

  // 6. GLB 생성
  await mark("GLB", "RUNNING", "");
  let modelPath: string | null = null;
  let optimizedStats = { vertices: 0, triangles: 0 };
  if (meshes.length > 0) {
    const glb = encodeGlb(meshes);
    modelPath = await saveProjectArtifact(projectId, "model.glb", glb);
    await mark("GLB", "OK", `model.glb 생성 · ${(glb.byteLength / 1024).toFixed(1)} KB`);
  } else {
    await mark("GLB", "WARN", "변환된 메시가 없어 GLB 를 생성하지 않았습니다.");
  }

  // 7. 최적화
  await mark("OPTIMIZE", "RUNNING", "");
  if (meshes.length > 0) {
    const optimized = optimizeMeshes(meshes);
    meshes = optimized.meshes;
    const stats = meshStats(meshes);
    optimizedStats = { vertices: stats.vertexCount, triangles: stats.triangleCount };
    const glb = encodeGlb(meshes);
    modelPath = await saveProjectArtifact(projectId, "model.glb", glb);
    await mark(
      "OPTIMIZE",
      "OK",
      `정점 ${optimized.report.beforeVertices.toLocaleString()} → ${optimized.report.afterVertices.toLocaleString()} (${optimized.report.reductionPct}% 절감) · 퇴화 삼각형 ${optimized.report.removedDegenerate}개 제거`,
    );
  } else {
    await mark("OPTIMIZE", "WARN", "최적화 대상 메시 없음");
  }

  // 8. 썸네일
  await mark("THUMBNAIL", "RUNNING", "");
  const stats = meshStats(meshes);
  let previewDataUri: string | null = null;
  if (referencePreview) {
    try {
      const jpeg = await rasterThumbJpeg(referencePreview, 640);
      previewDataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    } catch {
      previewDataUri = null;
    }
  }
  const fingerprint =
    aiAnalysis?.signature ??
    `MESH|${meshes.map((m) => m.name).join(",")}|${stats.vertexCount}|${stats.triangleCount}|${stats.size.map((v) => v.toFixed(3)).join("x")}`;
  const svg = buildThumbnailSvg({
    title: project.title,
    industry: industryLabel(project.industry),
    subtitle: `${analysis.formatLabel} · 부품 ${meshes.length}개 · ${project.isDemo ? "데모" : "프로젝트"}`,
    accent: analysis.kind === "2D" ? "#f59e0b" : "#38bdf8",
    badge: analysis.kind === "2D" ? "참고용 시각화" : "3D SHOWROOM",
    preview: previewDataUri,
    fingerprint,
    lines: [
      `정점 ${stats.vertexCount.toLocaleString()}개 · 삼각형 ${stats.triangleCount.toLocaleString()}개`,
      `크기 ${(stats.size[0] * 1000).toFixed(0)} × ${(stats.size[1] * 1000).toFixed(0)} × ${(stats.size[2] * 1000).toFixed(0)} mm`,
      referenceParts.length > 0 ? `부품: ${referenceParts.slice(0, 3).map((p) => p.name).join(" / ")}` : `파일 지문 ${fingerprint.slice(0, 12)}`,
    ],
  });
  const thumbnailPath = await saveThumbnail(projectId, svg, "svg");
  await mark("THUMBNAIL", "OK", previewDataUri ? "thumbnail.svg 생성 (도면 원본 미리보기 포함)" : "thumbnail.svg 생성 (메시 측정치·지문 포함)");

  // 9. 저장
  await mark("SAVE", "RUNNING", "");
  await prisma.part.deleteMany({ where: { projectId } });
  await prisma.animationSequence.deleteMany({ where: { projectId } });
  await prisma.cameraPreset.deleteMany({ where: { projectId } });

  const assemblyCenter: [number, number, number] = [
    (stats.bbox.min[0] + stats.bbox.max[0]) / 2,
    (stats.bbox.min[1] + stats.bbox.max[1]) / 2,
    (stats.bbox.min[2] + stats.bbox.max[2]) / 2,
  ];
  const sceneMax = Math.max(stats.size[0], stats.size[1], stats.size[2], 0.001);

  const partRows: { nodeName: string; name: string; material: string; center: [number, number, number]; size: [number, number, number] }[] = [];
  if (referenceParts.length > 0) {
    for (const p of referenceParts) {
      const mesh = meshes.find((m) => m.name === p.nodeName);
      const bounds = mesh ? partBounds(mesh) : { center: [0, 0, 0] as [number, number, number], size: [0, 0, 0] as [number, number, number] };
      partRows.push({ nodeName: p.nodeName, name: p.name, material: p.material, center: bounds.center, size: bounds.size });
    }
  } else {
    for (const mesh of meshes) {
      const meta = inferPartMeta(mesh);
      partRows.push({ nodeName: meta.nodeName, name: meta.name, material: meta.material, center: meta.center, size: meta.size });
    }
  }

  const createdParts = [];
  for (let i = 0; i < partRows.length; i++) {
    const row = partRows[i];
    const dir = partDirection(row.center, assemblyCenter);
    const meta = referenceParts.find((p) => p.nodeName === row.nodeName);
    void guessMaterial;
    const materialKey = row.material || "STEEL";
    const preset = materialPreset(materialKey);
    const mesh = meshes.find((m) => m.name === row.nodeName);
    const volume = row.size[0] * row.size[1] * row.size[2];
    const density = materialKey === "ALUMINUM" ? 2700 : materialKey === "COPPER" ? 8960 : materialKey === "PLASTIC" ? 1200 : 7850;
    const created = await prisma.part.create({
      data: {
        projectId,
        nodeName: row.nodeName,
        name: row.name,
        partNumber: `P-${String(i + 1).padStart(3, "0")}`,
        material: materialKey,
        spec: meta?.spec ?? `${(row.size[0] * 1000).toFixed(0)} × ${(row.size[1] * 1000).toFixed(0)} × ${(row.size[2] * 1000).toFixed(0)} mm`,
        weight: Math.max(0.01, Math.round(volume * density * 0.35 * 100) / 100),
        quantity: 1,
        description: meta?.description ?? `${row.name} — ${preset.label}`,
        color: `#${preset.color.replace("#", "")}`,
        order: i,
        centerX: row.center[0],
        centerY: row.center[1],
        centerZ: row.center[2],
        sizeX: row.size[0],
        sizeY: row.size[1],
        sizeZ: row.size[2],
        explodedX: dir[0],
        explodedY: dir[1],
        explodedZ: dir[2],
        explodedDistance: 0.6,
        isMoldPart: project.industry === "MOLD",
        moldRole: project.industry === "MOLD" ? guessMoldRole(row.name) : null,
        motionGroup: guessMotion(row.name),
        visible: true,
        opacity: 1,
      },
    });
    createdParts.push(created);
    void mesh;
  }

  const sequences = buildDefaultSequences({
    industry: project.industry,
    parts: createdParts.map((p) => ({ nodeName: p.nodeName, name: p.name })),
    sceneSize: sceneMax,
  });
  for (const seq of sequences) {
    await prisma.animationSequence.create({
      data: { projectId, name: seq.name, kind: seq.kind, durationMs: seq.durationMs, steps: JSON.stringify(seq.steps) },
    });
  }

  const center: [number, number, number] = assemblyCenter;
  const distance = Math.max(sceneMax * 1.9, 0.5);
  await prisma.cameraPreset.create({
    data: {
      projectId,
      name: "기본 뷰",
      positionX: center[0] + distance * 0.85,
      positionY: center[1] + distance * 0.55,
      positionZ: center[2] + distance * 0.95,
      targetX: center[0],
      targetY: center[1],
      targetZ: center[2],
      isDefault: true,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: needsExternal ? "CONVERT_REQUIRED" : "READY",
      sourceType,
      renderMode,
      isAiReference: Boolean(aiAnalysis && aiAnalysis.mode !== "NONE" && isDrawing) || renderMode !== "MESH_3D",
      aiMode: aiAnalysis?.mode ?? "NONE",
      aiAnalysis: JSON.stringify(aiAnalysis ?? {}),
      modelPath,
      modelFormat: analysis.formatId,
      referenceImageUrl,
      thumbnailPath,
      stats: JSON.stringify({ ...statsToJson(stats), optimized: optimizedStats, sizeMB: Math.round((stats.triangleCount * 0.0000025 + 0.05) * 100) / 100 }),
    },
  });
  const saveDetail = `부품 ${createdParts.length}개 · 애니메이션 ${sequences.length}개 · 카메라 프리셋 1개 저장`;
  await mark("SAVE", "OK", saveDetail);

  // 10. 실행
  await mark("LAUNCH", "RUNNING", "");
  if (needsExternal) {
    await mark("LAUNCH", "WARN", "3D 뷰어 대기 — 표준 GLB 변환 후 자동 실행됩니다.");
  } else {
    await mark("LAUNCH", "OK", `3D 뷰어 준비 완료 · /dashboard/projects/${projectId}`);
  }

  return await finish();
}
