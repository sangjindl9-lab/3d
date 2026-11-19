import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canManageClient, canManageLicense } from "@/lib/permissions";
import { normalizeBranding } from "@/lib/branding";
import { evaluateLicense } from "@/lib/license";

type Body = {
  name?: string;
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
  headerText?: string;
  footerText?: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const client = await prisma.client.findUnique({ where: { id }, include: { _count: { select: { projects: true, users: true } } } });
  if (!client) return fail("고객사를 찾을 수 없습니다.", 404);
  if (!canManageClient(user, id)) return fail("권한이 없습니다.", 403);

  const body = await parseBody<Body>(request);
  if (!body) return fail("요청 형식이 올바르지 않습니다.");
  const normalized = normalizeBranding(body as Record<string, unknown>, { allowLicense: canManageLicense(user) });
  if (normalized.error) return fail(normalized.error);
  const data = normalized.data;
  if (canManageLicense(user)) {
    const nextProjects = (data.maxProjects as number) ?? client.maxProjects;
    const nextUsers = (data.maxUsers as number) ?? client.maxUsers;
    if (nextProjects < client._count.projects) return fail(`이미 프로젝트 ${client._count.projects}개가 있어 한도를 ${nextProjects}개로 줄일 수 없습니다.`);
    if (nextUsers < client._count.users) return fail(`이미 사용자 ${client._count.users}명이 있어 한도를 ${nextUsers}명으로 줄일 수 없습니다.`);
  }

  const updated = await prisma.client.update({ where: { id }, data });
  const license = evaluateLicense(updated, { projectCount: client._count.projects, userCount: client._count.users });
  return json({ ok: true, client: { id: updated.id, name: updated.name, plan: updated.plan, features: updated.features }, license });
}
