import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fail, parseBody, shareCookie } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";

type Body = { password?: string };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const body = await parseBody<Body>(request);
  const link = await prisma.shareLink.findUnique({ where: { slug }, include: { project: { select: { status: true } } } });
  if (!link || !link.isActive) return fail("유효하지 않은 공유 링크입니다.", 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return fail("공유 링크가 만료되었습니다.", 410, "EXPIRED");
  if (link.project.status !== "READY") return fail("쇼룸이 아직 준비되지 않았습니다.", 409);
  if (!link.passwordHash) return NextResponse.json({ ok: true, unlocked: true });
  if (!verifyPassword(body?.password ?? "", link.passwordHash)) {
    return fail("비밀번호가 올바르지 않습니다.", 401, "INVALID_PASSWORD");
  }
  const cookie = shareCookie(slug);
  const response = NextResponse.json({ ok: true, unlocked: true });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    path: `/share/${slug}`,
    expires: link.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
  return response;
}
