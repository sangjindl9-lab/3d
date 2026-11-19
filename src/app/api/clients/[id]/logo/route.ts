import { prisma } from "@/lib/db";
import { actor, fail, json } from "@/lib/api";
import { canManageClient } from "@/lib/permissions";
import { saveClientLogo, fileUrl } from "@/lib/storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return fail("고객사를 찾을 수 없습니다.", 404);
  if (!canManageClient(user, id)) return fail("권한이 없습니다.", 403);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("로고 파일이 첨부되지 않았습니다.");
  if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return fail("PNG/JPG/SVG/WEBP 이미지만 업로드할 수 있습니다.");
  if (file.size > 2 * 1024 * 1024) return fail("로고는 2MB 이하만 업로드할 수 있습니다.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = await saveClientLogo(id, file.name, buffer);
  await prisma.client.update({ where: { id }, data: { logoPath: path } });
  return json({ ok: true, logoUrl: fileUrl(path) });
}
