import { prisma } from "@/lib/db";
import { actor, fail, json } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const preset = await prisma.cameraPreset.findUnique({ where: { id }, include: { project: true } });
  if (!preset) return fail("프리셋을 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: preset.project.ownerId, clientId: preset.project.clientId, isDemo: preset.project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  await prisma.cameraPreset.delete({ where: { id } });
  return json({ ok: true });
}
