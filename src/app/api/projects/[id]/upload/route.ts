import { prisma } from "@/lib/db";
import { actor, fail, json } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";
import { analyzeFile, humanSize } from "@/lib/formats";
import { saveProjectSource } from "@/lib/storage";
import { evaluateLicense } from "@/lib/license";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const project = await prisma.project.findUnique({ where: { id }, include: { client: true } });
  if (!project) return fail("프로젝트를 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: project.ownerId, clientId: project.clientId, isDemo: project.isDemo })) {
    return fail("업로드 권한이 없습니다.", 403);
  }
  if (project.client) {
    const license = evaluateLicense(project.client);
    if (!license.ok) return fail(license.reason, 403, license.code);
  }
  const form = await request.formData().catch(() => null);
  if (!form) return fail("업로드 데이터를 읽을 수 없습니다.");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("파일이 첨부되지 않았습니다.");
  if (file.size === 0) return fail("빈 파일입니다.");
  if (file.size > 80 * 1024 * 1024) return fail(`파일은 80MB 이하만 업로드할 수 있습니다. (현재 ${humanSize(file.size)})`);

  const buffer = Buffer.from(await file.arrayBuffer());
  const analysis = analyzeFile(buffer, file.name);
  if (analysis.kind === "UNKNOWN") {
    return fail(`지원하지 않는 파일 형식입니다. (${file.name})`, 415, "UNSUPPORTED_FORMAT");
  }
  const storedPath = await saveProjectSource(id, file.name, buffer);

  const url = new URL(request.url);
  if (url.searchParams.get("replace") === "1") {
    await prisma.upload.deleteMany({ where: { projectId: id } });
  }

  const upload = await prisma.upload.create({
    data: {
      projectId: id,
      originalName: file.name,
      storedPath,
      size: analysis.size,
      sha256: analysis.sha256,
      detectedFormat: analysis.formatId,
      declaredExt: analysis.declaredExt,
      kind: analysis.kind,
      integrity: analysis.integrity,
      meta: JSON.stringify(analysis.meta),
    },
  });

  return json({
    ok: true,
    upload: {
      id: upload.id,
      name: file.name,
      size: analysis.size,
      sizeLabel: humanSize(analysis.size),
      formatId: analysis.formatId,
      formatLabel: analysis.formatLabel,
      kind: analysis.kind,
      integrity: analysis.integrity,
      issues: analysis.issues,
      meta: analysis.meta,
      converter: analysis.converter,
    },
  });
}
