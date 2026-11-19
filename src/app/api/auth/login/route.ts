import { prisma } from "@/lib/db";
import { fail, json, parseBody } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  const body = await parseBody<Body>(request);
  if (!body) return fail("요청 형식이 올바르지 않습니다.");
  const email = (body.email ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(body.password ?? "", user.passwordHash)) {
    return fail("이메일 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");
  }
  await createSession(user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId } });
}
