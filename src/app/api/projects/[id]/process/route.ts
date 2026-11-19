import { prisma } from "@/lib/db";
import { actor, fail, json } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 120;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id }, include: { _count: { select: { uploads: true } } } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("처리 권한이 없습니다.", 403);
  }
  if (project._count.uploads === 0) return fail("먼저 파일을 업로드해 주세요.", 400, "NO_UPLOAD");
  try {
    const outcome = await runPipeline(id);
    return json({ ok: true, ...outcome });
  } catch (error) {
    await prisma.project.update({ where: { id }, data: { status: "FAILED" } }).catch(() => null);
    return fail(error instanceof Error ? error.message : "파이프라인 실행에 실패했습니다.", 500);
  }
}
