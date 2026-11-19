import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canManageUsers } from "@/lib/permissions";
import { evaluateLicense } from "@/lib/license";
import { hashPassword, isValidEmail, passwordIssue } from "@/lib/auth";

type Body = { email?: string; name?: string; password?: string; role?: string; clientId?: string };

export async function GET() {
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const where = user.role === "ADMIN" ? {} : { clientId: user.clientId ?? "none" };
  const users = await prisma.user.findMany({
    where,
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      clientId: u.clientId,
      clientName: u.client?.name ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const body = await parseBody<Body>(request);
  const email = (body?.email ?? "").trim().toLowerCase();
  const name = (body?.name ?? "").trim();
  if (!isValidEmail(email)) return fail("올바른 이메일을 입력하세요.");
  if (!name) return fail("이름을 입력하세요.");
  const issue = passwordIssue(body?.password ?? "");
  if (issue) return fail(issue);
  if (await prisma.user.findUnique({ where: { email } })) return fail("이미 사용 중인 이메일입니다.", 409);

  const role = body?.role === "CLIENT_ADMIN" ? "CLIENT_ADMIN" : "USER";
  if (role === "CLIENT_ADMIN" && user.role !== "ADMIN") return fail("고객사 관리자 계정은 시스템 관리자만 만들 수 있습니다.");
  const clientId = user.role === "ADMIN" ? body?.clientId ?? user.clientId : user.clientId;
  if (!clientId) return fail("고객사를 지정하세요.");
  if (!canManageUsers(user, clientId)) return fail("권한이 없습니다.", 403);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return fail("고객사를 찾을 수 없습니다.", 404);
  const userCount = await prisma.user.count({ where: { clientId } });
  const license = evaluateLicense(client, { userCount });
  if (!license.ok) return fail(license.reason, 403, license.code);

  const created = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(body!.password!), role, clientId },
  });
  return json({ ok: true, user: { id: created.id, email: created.email, name: created.name, role: created.role } });
}
