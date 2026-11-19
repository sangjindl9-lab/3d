import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";

type Body = { name?: string; position?: [number, number, number]; target?: [number, number, number] };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  const body = await parseBody<Body>(request);
  if (!body?.position || !body?.target || body.position.length !== 3 || body.target.length !== 3) {
    return fail("카메라 위치가 올바르지 않습니다.");
  }
  const count = await prisma.cameraPreset.count({ where: { projectId: id } });
  if (count >= 20) return fail("카메라 프리셋은 최대 20개까지 저장할 수 있습니다.");
  const preset = await prisma.cameraPreset.create({
    data: {
      projectId: id,
      name: (body.name ?? `뷰 ${count + 1}`).slice(0, 40),
      positionX: body.position[0],
      positionY: body.position[1],
      positionZ: body.position[2],
      targetX: body.target[0],
      targetY: body.target[1],
      targetZ: body.target[2],
    },
  });
  return json({ ok: true, preset: { id: preset.id, name: preset.name } });
}
