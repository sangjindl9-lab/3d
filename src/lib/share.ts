import { prisma } from "./db";
import { hashPassword } from "./auth";
import { hasFeature } from "./license";
import { canEditProject } from "./permissions";
import { randomSlug } from "./ids";

export type ShareActor = { id: string; role: string; clientId: string | null };

export type ShareOutcome =
  | { ok: true; slug: string; hasPassword: boolean; expiresAt: string | null; viewCount: number; allowDownload: boolean }
  | { ok: false; status: number; error: string; code?: string };

/** 공유 링크 발급/갱신 (권한·라이선스 검증 포함) — API 와 테스트가 함께 사용한다. */
export async function createShareLink(options: {
  projectId: string;
  actor: ShareActor | null;
  password?: string | null;
  days?: number;
  regenerate?: boolean;
}): Promise<ShareOutcome> {
  const project = await prisma.project.findUnique({ where: { id: options.projectId }, include: { client: true } });
  if (!project) return { ok: false, status: 404, error: "프로젝트를 찾을 수 없습니다.", code: "NOT_FOUND" };
  if (!options.actor) return { ok: false, status: 401, error: "로그인이 필요합니다.", code: "UNAUTHORIZED" };
  if (!canEditProject(options.actor, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return { ok: false, status: 403, error: "공유 링크 생성 권한이 없습니다.", code: "FORBIDDEN" };
  }
  if (project.client && !hasFeature(project.client, "SHARE")) {
    return { ok: false, status: 403, error: "현재 플랜에는 공유 링크 기능이 포함되어 있지 않습니다.", code: "FEATURE_NOT_INCLUDED" };
  }
  if (project.client && new Date(project.client.expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 403, error: "고객사 라이선스가 만료되어 공유 링크를 발급할 수 없습니다.", code: "LICENSE_EXPIRED" };
  }
  if (project.status !== "READY") {
    return { ok: false, status: 409, error: "쇼룸이 아직 준비되지 않아 공유할 수 없습니다.", code: "NOT_READY" };
  }

  const existing = await prisma.shareLink.findFirst({
    where: { projectId: project.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const expiresAt = options.days && options.days > 0 ? new Date(Date.now() + options.days * 86400000) : null;

  if (existing && !options.regenerate) {
    const updated = await prisma.shareLink.update({
      where: { id: existing.id },
      data: {
        expiresAt,
        ...(options.password !== undefined ? { passwordHash: options.password ? hashPassword(options.password) : null } : {}),
      },
    });
    return {
      ok: true,
      slug: updated.slug,
      hasPassword: Boolean(updated.passwordHash),
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      viewCount: updated.viewCount,
      allowDownload: updated.allowDownload,
    };
  }
  if (existing) {
    await prisma.shareLink.update({ where: { id: existing.id }, data: { isActive: false } });
  }
  let slug = randomSlug(10);
  for (let i = 0; i < 5; i++) {
    if (!(await prisma.shareLink.findUnique({ where: { slug } }))) break;
    slug = randomSlug(10);
  }
  const created = await prisma.shareLink.create({
    data: {
      projectId: project.id,
      slug,
      passwordHash: options.password ? hashPassword(options.password) : null,
      expiresAt,
      isActive: true,
      allowDownload: false,
    },
  });
  return {
    ok: true,
    slug: created.slug,
    hasPassword: Boolean(created.passwordHash),
    expiresAt: created.expiresAt?.toISOString() ?? null,
    viewCount: created.viewCount,
    allowDownload: created.allowDownload,
  };
}

export async function deactivateShareLinks(projectId: string): Promise<number> {
  const result = await prisma.shareLink.updateMany({ where: { projectId, isActive: true }, data: { isActive: false } });
  return result.count;
}

export async function findActiveShare(slug: string) {
  return prisma.shareLink.findUnique({ where: { slug }, include: { project: { select: { status: true, title: true } } } });
}

export function shareState(link: { isActive: boolean; expiresAt: Date | null } | null): "ACTIVE" | "INACTIVE" | "EXPIRED" | "MISSING" {
  if (!link) return "MISSING";
  if (!link.isActive) return "INACTIVE";
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return "EXPIRED";
  return "ACTIVE";
}
