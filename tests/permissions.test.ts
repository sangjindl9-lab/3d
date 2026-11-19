import { describe, expect, it } from "vitest";
import { canEditProject, canManageClient, canManageLicense, canManageUsers, canViewProject, roleLabel } from "@/lib/permissions";

const admin = { id: "u-admin", role: "ADMIN", clientId: null };
const clientAdmin = { id: "u-ca", role: "CLIENT_ADMIN", clientId: "c1" };
const normalUser = { id: "u-user", role: "USER", clientId: "c1" };
const otherClientUser = { id: "u-other", role: "USER", clientId: "c2" };

const own = { ownerId: "u-user", clientId: "c1", isDemo: false };
const colleague = { ownerId: "u-ca", clientId: "c1", isDemo: false };
const foreign = { ownerId: "u-other", clientId: "c2", isDemo: false };
const demo = { ownerId: null, clientId: "c2", isDemo: true };

describe("역할별 접근 권한", () => {
  it("관리자는 모든 프로젝트를 열람·편집한다", () => {
    expect(canViewProject(admin, foreign)).toBe(true);
    expect(canEditProject(admin, foreign)).toBe(true);
  });

  it("고객사 관리자는 같은 고객사 프로젝트를 편집한다", () => {
    expect(canViewProject(clientAdmin, colleague)).toBe(true);
    expect(canEditProject(clientAdmin, colleague)).toBe(true);
    expect(canEditProject(clientAdmin, foreign)).toBe(false);
  });

  it("일반 사용자는 본인 프로젝트만 편집한다", () => {
    expect(canViewProject(normalUser, colleague)).toBe(true);
    expect(canEditProject(normalUser, own)).toBe(true);
    expect(canEditProject(normalUser, colleague)).toBe(false);
    expect(canViewProject(normalUser, foreign)).toBe(false);
  });

  it("데모는 누구나 열람하지만 로그인 없이는 편집할 수 없다", () => {
    expect(canViewProject(null, demo)).toBe(true);
    expect(canEditProject(null, demo)).toBe(false);
    expect(canViewProject(otherClientUser, demo)).toBe(true);
  });

  it("고객사/라이선스/사용자 관리 권한을 구분한다", () => {
    expect(canManageClient(admin, "c1")).toBe(true);
    expect(canManageClient(clientAdmin, "c1")).toBe(true);
    expect(canManageClient(clientAdmin, "c2")).toBe(false);
    expect(canManageLicense(admin)).toBe(true);
    expect(canManageLicense(clientAdmin)).toBe(false);
    expect(canManageUsers(clientAdmin, "c1")).toBe(true);
    expect(canManageUsers(normalUser, "c1")).toBe(false);
    expect(roleLabel("ADMIN")).toBe("시스템 관리자");
  });
});
