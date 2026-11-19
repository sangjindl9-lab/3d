import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { Role } from "./constants";

/**
 * 비밀번호 해싱 — 외부 네이티브 의존성 없이 scrypt 사용.
 * 저장 형식: scrypt$<salt-hex>$<hash-hex>
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`${token}:${process.env.APP_SECRET ?? "eum3d"}`).digest("hex");
}

export const SESSION_COOKIE = "eum3d_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function isRole(value: string): value is Role {
  return value === "ADMIN" || value === "CLIENT_ADMIN" || value === "USER";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function passwordIssue(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호에는 영문과 숫자가 모두 포함되어야 합니다.";
  }
  return null;
}
