import { prisma } from "@/lib/db";
import { fail, json, parseBody } from "@/lib/api";
import { hashPassword, isValidEmail, passwordIssue } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { evaluateLicense } from "@/lib/license";

type Body = { email?: string; password?: string; name?: string; companyCode?: string };

export async function POST(request: Request) {
  const body = await parseBody<Body>(request);
  if (!body) return fail("요청 형식이 올바르지 않습니다.");
  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  if (!isValidEmail(email)) return fail("올바른 이메일을 입력하세요.");
  if (!name) return fail("이름을 입력하세요.");
  const issue = passwordIssue(body.password ?? "");
  if (issue) return fail(issue);
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return fail("이미 가입된 이메일입니다.", 409, "EMAIL_TAKEN");

  let clientId: string | null = null;
  if (body.companyCode) {
    const client = await prisma.client.findUnique({ where: { slug: body.companyCode.trim() } });
    if (!client) return fail("고객사 코드를 찾을 수 없습니다.", 404, "CLIENT_NOT_FOUND");
    const userCount = await prisma.user.count({ where: { clientId: client.id } });
    const license = evaluateLicense(client, { userCount });
    if (!license.ok) return fail(license.reason, 403, license.code);
    clientId = client.id;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(body.password!),
      role: "USER",
      clientId,
    },
  });
  await createSession(user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId } });
}
