import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canViewProject, type Actor } from "@/lib/permissions";
import { evaluateLicense } from "@/lib/license";
import { industryPreset, PLAN_PRESETS } from "@/lib/constants";
import { fileUrl } from "@/lib/storage";

export async function GET() {
  const user = await actor();
  const projects = await prisma.project.findMany({
    where: user
      ? user.role === "ADMIN"
        ? {}
        : { OR: [{ clientId: user.clientId ?? "none" }, { ownerId: user.id }, { isDemo: true }] }
      : { isPublicDemo: true },
    include: { client: true, _count: { select: { parts: true } }, shareLinks: { where: { isActive: true }, take: 1 } },
    orderBy: [{ isDemo: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  const ref = (p: (typeof projects)[number]) => ({ ownerId: p.ownerId, clientId: p.clientId, isDemo: p.isDemo });
  const visible = projects.filter((p) => canViewProject(user as Actor | null, ref(p)));
  return json({
    projects: visible.map((p) => ({
      id: p.id,
      title: p.title,
      industry: p.industry,
      status: p.status,
      isDemo: p.isDemo,
      isAiReference: p.isAiReference,
      thumbnailUrl: fileUrl(p.thumbnailPath),
      partCount: p._count.parts,
      clientName: p.client?.name ?? null,
      shareSlug: p.shareLinks[0]?.slug ?? null,
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

type Body = { title?: string; description?: string; industry?: string; clientId?: string; template?: string };

export async function POST(request: Request) {
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401, "UNAUTHORIZED");
  const body = await parseBody<Body>(request);
  const title = (body?.title ?? "").trim();
  if (!title) return fail("프로젝트 이름을 입력하세요.");
  const industry = body?.industry ?? "MANUFACTURING";
  const preset = industryPreset(industry);

  let clientId: string | null = null;
  if (user.role === "ADMIN") {
    clientId =
      body?.clientId ??
      (
        await prisma.client.findFirst({
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id ??
      null;
  } else {
    clientId = user.clientId;
  }
  if (!clientId) return fail("고객사 라이선스가 연결되지 않았습니다. 관리자에게 문의하세요.", 403, "NO_CLIENT");

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return fail("고객사를 찾을 수 없습니다.", 404);
  const projectCount = await prisma.project.count({ where: { clientId } });
  const license = evaluateLicense(client, { projectCount });
  if (!license.ok) return fail(license.reason, 403, license.code);

  const project = await prisma.project.create({
    data: {
      title: title.slice(0, 120),
      description: (body?.description ?? "").slice(0, 2000) || null,
      industry,
      template: body?.template ?? preset.defaultTemplate,
      background: body?.template === "WHITE_STUDIO" ? "WHITE" : "STUDIO",
      status: "DRAFT",
      ownerId: user.id,
      clientId,
      isDemo: false,
    },
  });
  return json({ ok: true, project: { id: project.id, title: project.title }, plan: PLAN_PRESETS[client.plan]?.label ?? client.plan });
}
