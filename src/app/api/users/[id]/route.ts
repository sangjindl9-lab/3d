import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canManageUsers } from "@/lib/permissions";
import { hashPassword, passwordIssue } from "@/lib/auth";

type Body = { name?: string; role?: string; password?: string; };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail("사용자를 찾을 수 없습니다.", 404);
  if (target.role === "ADMIN" && user.role !== "ADMIN") return fail("시스템 관리자 계정은 변경할 수 없습니다.", 403);
  if (user.role !== "ADMIN" && target.clientId !== user.clientId) return fail("다른 고객사 사용자는 변경할 수 없습니다.", 403);
  if (user.role !== "ADMIN" && target.id !== user.id && !canManageUsers(user, target.clientId ?? "")) {
    return fail("권한이 없습니다.", 403);
  }
  const body = await parseBody<Body>(request);
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 40);
  if (typeof body?.role === "string") {
    if (user.role !== "ADMIN" && body.role !== "USER") return fail("역할 변경은 시스템 관리자만 가능합니다.", 403);
    if (!["ADMIN", "CLIENT_ADMIN", "USER"].includes(body.role)) return fail("올바르지 않은 역할입니다.");
    data.role = body.role;
  }
  if (typeof body?.password === "string" && body.password.length > 0) {
    const issue = passwordIssue(body.password);
    if (issue) return fail(issue);
    data.passwordHash = hashPassword(body.password);
  }
  const updated = await prisma.user.update({ where: { id }, data });
  return json({ ok: true, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
}
