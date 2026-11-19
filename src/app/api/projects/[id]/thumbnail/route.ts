import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";
import { saveThumbnail } from "@/lib/storage";

type Body = { dataUrl?: string };

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("권한이 없습니다.", 403);
  }
  const body = await parseBody<Body>(request);
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(body?.dataUrl ?? "");
  if (!match) return fail("이미지 데이터가 올바르지 않습니다.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 12 * 1024 * 1024) return fail("썸네일은 12MB 이하만 저장할 수 있습니다.");
  const path = await saveThumbnail(id, buffer, "png");
  await prisma.project.update({ where: { id }, data: { thumbnailPath: path } });
  return json({ ok: true, thumbnailPath: path });
}
