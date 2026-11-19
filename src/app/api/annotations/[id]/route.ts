import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";

type Body = { title?: string; body?: string };

async function load(id: string) {
  return prisma.annotation.findUnique({ where: { id }, include: { project: true } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const annotation = await load(id);
  if (!annotation) return fail("주석을 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: annotation.project.ownerId, clientId: annotation.project.clientId, isDemo: annotation.project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  const body = await parseBody<Body>(request);
  const updated = await prisma.annotation.update({
    where: { id },
    data: {
      ...(typeof body?.title === "string" && body.title.trim() ? { title: body.title.trim().slice(0, 80) } : {}),
      ...(typeof body?.body === "string" ? { body: body.body.slice(0, 600) } : {}),
    },
  });
  return json({ ok: true, annotation: updated });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const annotation = await load(id);
  if (!annotation) return fail("주석을 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: annotation.project.ownerId, clientId: annotation.project.clientId, isDemo: annotation.project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  await prisma.annotation.delete({ where: { id } });
  return json({ ok: true });
}
