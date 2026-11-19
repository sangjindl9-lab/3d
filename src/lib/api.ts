import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./session";
import { randomSlug, slugify } from "./ids";

export { randomSlug, slugify };

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ error: message, code: code ?? "ERROR" }, { status });
}

export async function actor(): Promise<SessionUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function requireActor(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: fail("로그인이 필요합니다.", 401, "UNAUTHORIZED") };
  return { user };
}

export function isFail(value: { user: SessionUser } | { response: NextResponse }): value is { response: NextResponse } {
  return "response" in value;
}

export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** 공유 링크 비밀번호 통과 쿠키 값 (서버 서명) */
export function shareCookie(slug: string): { name: string; value: string } {
  const secret = process.env.APP_SECRET ?? "eum3d";
  let hash = 0;
  const raw = `${slug}:${secret}`;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return { name: `eum3d_share_${slug}`, value: `ok_${Math.abs(hash).toString(36)}` };
}
