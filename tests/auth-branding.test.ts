import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, hashToken, isValidEmail, passwordIssue, verifyPassword } from "@/lib/auth";
import { normalizeBranding } from "@/lib/branding";

describe("인증 · 비밀번호", () => {
  it("scrypt 해시를 저장하고 검증한다", () => {
    const hash = hashPassword("Eum3d!2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Eum3d!2026", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("Eum3d!2026", "plain")).toBe(false);
  });

  it("세션 토큰은 매번 다르고 해시가 일정하다", () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });

  it("비밀번호 정책과 이메일 검사", () => {
    expect(passwordIssue("short")).toContain("8자");
    expect(passwordIssue("onlyletters")).toContain("영문과 숫자");
    expect(passwordIssue("Passw0rd")).toBeNull();
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("bad@")).toBe(false);
  });
});

describe("화이트라벨 설정", () => {
  it("브랜딩 필드를 정규화한다", () => {
    const { data, error } = normalizeBranding(
      { primaryColor: "#22d3ee", accentColor: "#0ea5e9", slogan: "  슬로건  ", headerText: "헤더", footerText: "푸터" },
      { allowLicense: false },
    );
    expect(error).toBeUndefined();
    expect(data.primaryColor).toBe("#22d3ee");
    expect(data.slogan).toBe("슬로건");
  });

  it("잘못된 컬러를 거부한다", () => {
    expect(normalizeBranding({ primaryColor: "red" }, { allowLicense: true }).error).toContain("#RRGGBB");
  });

  it("고객사 관리자는 라이선스 필드를 변경할 수 없다", () => {
    const { data } = normalizeBranding({ plan: "ENTERPRISE", primaryColor: "#ffffff" }, { allowLicense: false });
    expect(data.plan).toBeUndefined();
    expect(data.maxProjects).toBeUndefined();
    expect(data.primaryColor).toBe("#ffffff");
  });

  it("관리자는 플랜 프리셋과 기능을 변경한다", () => {
    const { data, error } = normalizeBranding({ plan: "ENTERPRISE", features: ["SHARE", "BOGUS"] }, { allowLicense: true });
    expect(error).toBeUndefined();
    expect(data.plan).toBe("ENTERPRISE");
    expect(data.maxProjects).toBe(200);
    expect(JSON.parse(String(data.features))).toEqual(["SHARE"]);
  });

  it("잘못된 만료일과 한도를 거부한다", () => {
    expect(normalizeBranding({ expiresAt: "not-a-date" }, { allowLicense: true }).error).toContain("만료일");
    expect(normalizeBranding({ maxProjects: 0 }, { allowLicense: true }).error).toContain("프로젝트");
  });
});
