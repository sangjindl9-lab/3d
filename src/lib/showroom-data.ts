import { prisma } from "./db";
import { fileUrl } from "./storage";
import { parseFeatures } from "./license";
import type { FeatureKey } from "./constants";
import { canEditProject, type Actor } from "./permissions";
import type { EngineAnnotation, EnginePart, SequenceDef } from "@/components/showroom/engine";
import { templateByKey } from "./constants";

export type ShowroomPayload = {
  project: {
    id: string;
    title: string;
    description: string | null;
    industry: string;
    template: string;
    background: string;
    status: string;
    sourceType: string;
    renderMode: string;
    isAiReference: boolean;
    aiMode: string | null;
    aiAnalysis: Record<string, unknown>;
    stats: Record<string, unknown>;
    modelUrl: string | null;
    thumbnailUrl: string | null;
    referenceImageUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  parts: EnginePart[];
  annotations: EngineAnnotation[];
  presets: { id: string; name: string; position: [number, number, number]; target: [number, number, number]; isDefault: boolean }[];
  sequences: SequenceDef[];
  brand: {
    clientName: string;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    slogan: string | null;
    headerText: string | null;
    footerText: string | null;
  } | null;
  clientPlan: string | null;
  features: FeatureKey[];
  canEdit: boolean;
  share: { slug: string; hasPassword: boolean; expiresAt: string | null; viewCount: number; allowDownload: boolean } | null;
  availability: { ok: boolean; reason: string | null };
};

export type BuildPayloadOptions = {
  actor?: Actor | null;
  forShare?: boolean;
};

/** 파일 URL 에 변경 시각 기반 버전을 붙여 이전 모델/썸네일이 캐시에서 보이는 문제를 막는다. */
function withVersion(url: string | null, updatedAt: Date): string | null {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}v=${updatedAt.getTime()}`;
}

export async function buildShowroomPayload(projectId: string, options: BuildPayloadOptions = {}): Promise<ShowroomPayload | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      parts: { orderBy: { order: "asc" } },
      annotations: { orderBy: { createdAt: "asc" } },
      presets: { orderBy: { createdAt: "asc" } },
      sequences: { orderBy: { createdAt: "asc" } },
      shareLinks: { orderBy: { createdAt: "desc" }, take: 1 },
      client: true,
    },
  });
  if (!project) return null;

  const template = templateByKey(project.template);
  const shareLink = project.shareLinks[0] ?? null;
  const features = project.client ? parseFeatures(project.client.features) : [];
  const clientExpired = project.client ? new Date(project.client.expiresAt).getTime() < Date.now() : false;

  const parts: EnginePart[] = project.parts.map((p) => ({
    id: p.id,
    nodeName: p.nodeName,
    name: p.name,
    partNumber: p.partNumber,
    material: p.material,
    spec: p.spec,
    weight: p.weight,
    quantity: p.quantity,
    description: p.description,
    color: p.color ?? "#aeb8c4",
    order: p.order,
    visible: p.visible,
    opacity: p.opacity,
    center: [p.centerX, p.centerY, p.centerZ],
    size: [p.sizeX, p.sizeY, p.sizeZ],
    exploded: [p.explodedX, p.explodedY, p.explodedZ],
    explodedDistance: p.explodedDistance,
    moldRole: p.moldRole,
    motionGroup: p.motionGroup,
  }));

  let aiAnalysis: Record<string, unknown> = {};
  try {
    aiAnalysis = JSON.parse(project.aiAnalysis || "{}");
  } catch {
    aiAnalysis = {};
  }
  let stats: Record<string, unknown> = {};
  try {
    stats = JSON.parse(project.stats || "{}");
  } catch {
    stats = {};
  }

  const canEdit = options.forShare ? false : canEditProject(options.actor ?? null, {
    ownerId: project.ownerId,
    clientId: project.clientId,
    isDemo: project.isDemo,
  });

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      industry: project.industry,
      template: template.key,
      background: project.background,
      status: project.status,
      sourceType: project.sourceType,
      renderMode: project.renderMode,
      isAiReference: project.isAiReference,
      aiMode: project.aiMode,
      aiAnalysis,
      stats,
      // 모델/참고 이미지는 경로가 같아도 내용이 바뀌므로 버전 쿼리로 브라우저 캐시를 무효화한다.
      modelUrl: withVersion(fileUrl(project.modelPath), project.updatedAt),
      thumbnailUrl: withVersion(fileUrl(project.thumbnailPath), project.updatedAt),
      referenceImageUrl: project.referenceImageUrl,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    parts,
    annotations: project.annotations.map((a) => ({ id: a.id, title: a.title, body: a.body, x: a.x, y: a.y, z: a.z })),
    presets: project.presets.map((c) => ({
      id: c.id,
      name: c.name,
      position: [c.positionX, c.positionY, c.positionZ],
      target: [c.targetX, c.targetY, c.targetZ],
      isDefault: c.isDefault,
    })),
    sequences: project.sequences.map((s) => {
      let steps: SequenceDef["steps"] = [];
      try {
        steps = JSON.parse(s.steps || "[]");
      } catch {
        steps = [];
      }
      return { id: s.id, name: s.name, kind: s.kind, durationMs: s.durationMs, steps };
    }),
    brand: project.client
      ? {
          clientName: project.client.name,
          logoUrl: fileUrl(project.client.logoPath),
          primaryColor: project.client.primaryColor,
          accentColor: project.client.accentColor,
          slogan: project.client.slogan,
          headerText: project.client.headerText,
          footerText: project.client.footerText,
        }
      : null,
    clientPlan: project.client?.plan ?? null,
    features,
    canEdit,
    share: shareLink
      ? {
          slug: shareLink.slug,
          hasPassword: Boolean(shareLink.passwordHash),
          expiresAt: shareLink.expiresAt ? shareLink.expiresAt.toISOString() : null,
          viewCount: shareLink.viewCount,
          allowDownload: shareLink.allowDownload,
        }
      : null,
    availability: {
      ok: project.status === "READY" && !clientExpired,
      reason:
        clientExpired
          ? "고객사 라이선스가 만료되어 쇼룸을 표시할 수 없습니다. 라이선스 갱신 후 이용해 주세요."
          : project.status === "READY"
            ? null
            : project.status === "CONVERT_REQUIRED"
              ? "이 형식은 외부 CAD 변환기가 필요합니다. STEP/GLB/STL/OBJ 로 변환 후 다시 업로드해 주세요."
              : "쇼룸이 아직 준비되지 않았습니다.",
    },
  };
}
