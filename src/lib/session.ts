import { cookies } from "next/headers";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken, hashToken } from "./auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string | null;
  client: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    expiresAt: Date;
    maxProjects: number;
    maxUsers: number;
    features: string;
    logoPath: string | null;
    primaryColor: string;
    accentColor: string;
    slogan: string | null;
    headerText: string | null;
    footerText: string | null;
  } | null;
};

export async function createSession(userId: string): Promise<void> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { token: hashToken(token), userId, expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: {
      user: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              expiresAt: true,
              maxProjects: true,
              maxUsers: true,
              features: true,
              logoPath: true,
              primaryColor: true,
              accentColor: true,
              slogan: true,
              headerText: true,
              footerText: true,
            },
          },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    clientId: u.clientId,
    client: u.client,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
