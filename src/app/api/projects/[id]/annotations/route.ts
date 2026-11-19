import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";
import { hasFeature } from "@/lib/license";

type Body = { title?: string; body?: string; x?: number; y?: number; z?: number };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id }, include: { client: true } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("주석 작성 권한이 없습니다.", 403);
  }
  if (project.client && !hasFeature(project.client, "ANNOTATION")) {
    return fail("현재 플랜에는 3D 주석 기능이 포함되어 있지 않습니다.", 403, "FEATURE_NOT_INCLUDED");
  }
  const body = await parseBody<Body>(request);
  const title = (body?.title ?? "").trim();
  if (!title) return fail("주석 제목을 입력하세요.");
  if (typeof body?.x !== "number" || typeof body?.y !== "number" || typeof body?.z !== "number") {
    return fail("주석 위치가 올바르지 않습니다.");
  }
  const annotation = await prisma.annotation.create({
    data: {
      projectId: id,
      title: title.slice(0, 80),
      body: (body?.body ?? "").slice(0, 600),
      x: body.x,
      y: body.y,
      z: body.z,
      authorName: user.name,
    },
  });
  return json({ ok: true, annotation: { id: annotation.id, title: annotation.title, body: annotation.body, x: annotation.x, y: annotation.y, z: annotation.z } });
}
