import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject, canViewProject } from "@/lib/permissions";
import type { EnginePart } from "@/components/showroom/engine";
import { STORAGE_ROOT, fileUrl } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      parts: { orderBy: { order: "asc" } },
      client: true,
      sequences: { orderBy: { createdAt: "asc" } },
      annotations: { orderBy: { createdAt: "asc" } },
      presets: { orderBy: { createdAt: "asc" } },
      shareLinks: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canViewProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("열람 권한이 없습니다.", 403);
  }
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
  const parseJson = (raw: string | null): Record<string, unknown> => {
    try {
      return JSON.parse(raw ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const version = project.updatedAt.getTime();
  return json({
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      template: project.template,
      background: project.background,
      sourceType: project.sourceType,
      renderMode: project.renderMode,
      isAiReference: project.isAiReference,
      aiMode: project.aiMode,
      aiAnalysis: parseJson(project.aiAnalysis),
      stats: parseJson(project.stats),
      // 같은 경로로 재생성되는 자산은 버전 쿼리로 브라우저 캐시를 무효화한다.
      modelUrl: project.modelPath ? `${fileUrl(project.modelPath)}?v=${version}` : null,
      referenceImageUrl: project.referenceImageUrl,
      thumbnailUrl: project.thumbnailPath ? `${fileUrl(project.thumbnailPath)}?v=${version}` : null,
      share: project.shareLinks[0]
        ? {
            slug: project.shareLinks[0].slug,
            hasPassword: Boolean(project.shareLinks[0].passwordHash),
            expiresAt: project.shareLinks[0].expiresAt?.toISOString() ?? null,
            viewCount: project.shareLinks[0].viewCount,
            allowDownload: project.shareLinks[0].allowDownload,
          }
        : null,
    },
    parts,
    sequences: project.sequences.map((s) => ({ id: s.id, name: s.name, kind: s.kind, durationMs: s.durationMs, steps: JSON.parse(s.steps || "[]") })),
    annotations: project.annotations.map((a) => ({ id: a.id, title: a.title, body: a.body, x: a.x, y: a.y, z: a.z })),
    presets: project.presets.map((c) => ({
      id: c.id,
      name: c.name,
      position: [c.positionX, c.positionY, c.positionZ],
      target: [c.targetX, c.targetY, c.targetZ],
      isDefault: c.isDefault,
    })),
  });
}

type PatchBody = { title?: string; description?: string; template?: string; background?: string; clientId?: string };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("편집 권한이 없습니다.", 403);
  }
  const body = await parseBody<PatchBody>(request);
  if (!body) return fail("요청 형식이 올바르지 않습니다.");
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
  if (typeof body.description === "string") data.description = body.description.slice(0, 2000);
  if (typeof body.template === "string") data.template = body.template;
  if (typeof body.background === "string") data.background = body.background;
  if (typeof body.clientId === "string" && user.role === "ADMIN") data.clientId = body.clientId || null;
  const updated = await prisma.project.update({ where: { id }, data });
  return json({ ok: true, project: { id: updated.id, title: updated.title, template: updated.template, background: updated.background } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("삭제 권한이 없습니다.", 403);
  }
  await prisma.project.delete({ where: { id } });
  await fs.rm(path.join(STORAGE_ROOT, "projects", id), { recursive: true, force: true }).catch(() => null);
  return json({ ok: true });
}
