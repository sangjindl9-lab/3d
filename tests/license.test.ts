import { describe, expect, it } from "vitest";
import { evaluateLicense, hasFeature, licenseSummary, parseFeatures } from "@/lib/license";
import { FEATURE_KEYS, PLAN_PRESETS } from "@/lib/constants";

const base = {
  plan: "PROFESSIONAL",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  maxProjects: 3,
  maxUsers: 2,
  features: JSON.stringify(["SHARE", "QR", "SNAPSHOT", "VIDEO"]),
};

describe("고객사 라이선스 실시간 검증", () => {
  it("정상 라이선스와 잔여량을 계산한다", () => {
    const result = evaluateLicense(base, { projectCount: 1, userCount: 1 });
    expect(result.ok).toBe(true);
    expect(result.code).toBe("OK");
    expect(result.remainingProjects).toBe(2);
    expect(result.remainingUsers).toBe(1);
  });

  it("만료된 라이선스를 차단한다", () => {
    const result = evaluateLicense({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }, {});
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LICENSE_EXPIRED");
    expect(result.reason).toContain("만료");
  });

  it("프로젝트 한도와 사용자 한도를 차단한다", () => {
    expect(evaluateLicense(base, { projectCount: 3 }).code).toBe("PROJECT_LIMIT");
    expect(evaluateLicense(base, { userCount: 2 }).code).toBe("USER_LIMIT");
  });

  it("플랜에 없는 기능을 차단한다", () => {
    const result = evaluateLicense(base, { feature: "MOLD_ANIM" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("FEATURE_NOT_INCLUDED");
    expect(hasFeature(base, "SHARE")).toBe(true);
    expect(hasFeature(base, "MOLD_ANIM")).toBe(false);
  });

  it("손상된 기능 JSON 은 빈 목록으로 처리한다", () => {
    expect(parseFeatures("{broken")).toEqual([]);
    expect(parseFeatures("null")).toEqual([]);
    expect(parseFeatures(JSON.stringify(["SHARE", "UNKNOWN_FEATURE"]))).toEqual(["SHARE"]);
  });

  it("고객사 미배정은 NO_CLIENT 로 차단한다", () => {
    expect(evaluateLicense(null, {}).code).toBe("NO_CLIENT");
  });

  it("플랜 프리셋의 기능 구성이 유효하다", () => {
    for (const preset of Object.values(PLAN_PRESETS)) {
      for (const feature of preset.features) expect(FEATURE_KEYS).toContain(feature);
    }
    const summary = licenseSummary(base);
    expect(summary.expired).toBe(false);
    expect(summary.features).toContain("SHARE");
  });
});
