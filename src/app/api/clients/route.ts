import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody, slugify } from "@/lib/api";
import { PLAN_PRESETS, FEATURE_KEYS, type FeatureKey } from "@/lib/constants";
import { parseFeatures, evaluateLicense } from "@/lib/license";

export async function GET() {
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const clients = await prisma.client.findMany({
    where: user.role === "ADMIN" ? {} : { id: user.clientId ?? "none" },
    include: { _count: { select: { users: true, projects: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json({
    clients: clients.map((c) => {
      const license = evaluateLicense(c, { projectCount: 0, userCount: 0 });
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        plan: c.plan,
        expiresAt: c.expiresAt.toISOString(),
        maxProjects: c.maxProjects,
        maxUsers: c.maxUsers,
        features: parseFeatures(c.features),
        projectCount: c._count.projects,
        userCount: c._count.users,
        logoUrl: c.logoPath ? `/api/files/${c.logoPath}` : null,
        primaryColor: c.primaryColor,
        accentColor: c.accentColor,
        slogan: c.slogan,
        headerText: c.headerText,
        footerText: c.footerText,
        contactEmail: c.contactEmail,
        businessNo: c.businessNo,
        expired: license.code === "LICENSE_EXPIRED",
      };
    }),
  });
}

type Body = {
  name?: string;
  slug?: string;
  plan?: string;
  expiresAt?: string;
  maxProjects?: number;
  maxUsers?: number;
  features?: string[];
  contactEmail?: string;
  businessNo?: string;
  primaryColor?: string;
  accentColor?: string;
  slogan?: string;
};

export async function POST(request: Request) {
  const user = await actor();
  if (!user || user.role !== "ADMIN") return fail("시스템 관리자만 고객사를 등록할 수 있습니다.", 403);
  const body = await parseBody<Body>(request);
  const name = (body?.name ?? "").trim();
  if (!name) return fail("고객사명을 입력하세요.");
  const plan = body?.plan && PLAN_PRESETS[body.plan] ? body.plan : "STARTER";
  const preset = PLAN_PRESETS[plan];
  const features = (body?.features ?? preset.features).filter((f): f is FeatureKey => FEATURE_KEYS.includes(f as FeatureKey));
  let slug = (body?.slug ? slugify(body.slug) : slugify(name)) || `client-${Date.now()}`;
  if (await prisma.client.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 365 * 86400000);
  if (Number.isNaN(expiresAt.getTime())) return fail("만료일이 올바르지 않습니다.");
  const client = await prisma.client.create({
    data: {
      name,
      slug,
      plan,
      expiresAt,
      maxProjects: body?.maxProjects ?? preset.maxProjects,
      maxUsers: body?.maxUsers ?? preset.maxUsers,
      features: JSON.stringify(features),
      contactEmail: body?.contactEmail ?? null,
      businessNo: body?.businessNo ?? null,
      primaryColor: body?.primaryColor ?? "#2dd4bf",
      accentColor: body?.accentColor ?? "#38bdf8",
      slogan: body?.slogan ?? null,
    },
  });
  return json({ ok: true, client: { id: client.id, name: client.name, slug: client.slug, plan: client.plan } });
}
