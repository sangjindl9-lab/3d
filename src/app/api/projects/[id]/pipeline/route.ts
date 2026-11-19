import { prisma } from "@/lib/db";
import { actor, fail, json } from "@/lib/api";
import { canViewProject } from "@/lib/permissions";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  const project = await prisma.project.findUnique({ where: { id }, select: { ownerId: true, clientId: true, isDemo: true, status: true } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canViewProject(user, project)) return fail("열람 권한이 없습니다.", 403);
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: id },
    orderBy: { startedAt: "desc" },
    include: { stages: { orderBy: { step: "asc" } } },
  });
  return json({
    status: project.status,
    run: run
      ? {
          id: run.id,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          stages: run.stages.map((s) => ({ step: s.step, key: s.key, label: s.label, status: s.status, detail: s.detail })),
        }
      : null,
  });
}
