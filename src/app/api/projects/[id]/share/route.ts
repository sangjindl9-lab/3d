import { actor, fail, json, parseBody } from "@/lib/api";
import { createShareLink, deactivateShareLinks } from "@/lib/share";
import { prisma } from "@/lib/db";
import { canEditProject } from "@/lib/permissions";

type Body = { password?: string | null; days?: number; regenerate?: boolean };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  const body = await parseBody<Body>(request);
  const result = await createShareLink({
    projectId: id,
    actor: user ? { id: user.id, role: user.role, clientId: user.clientId } : null,
    password: body?.password,
    days: typeof body?.days === "number" ? body.days : 0,
    regenerate: Boolean(body?.regenerate),
  });
  if (!result.ok) return fail(result.error, result.status, result.code);
  return json(result);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  const count = await deactivateShareLinks(id);
  return json({ ok: true, deactivated: count });
}
