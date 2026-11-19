import { FEATURE_KEYS, type FeatureKey } from "./constants";

export type LicenseClient = {
  name?: string;
  plan: string;
  expiresAt: Date | string;
  maxProjects: number;
  maxUsers: number;
  features: string;
};

export type LicenseCode =
  | "OK"
  | "NO_CLIENT"
  | "LICENSE_EXPIRED"
  | "PROJECT_LIMIT"
  | "USER_LIMIT"
  | "FEATURE_NOT_INCLUDED";

export type LicenseResult = {
  ok: boolean;
  code: LicenseCode;
  reason: string;
  features: FeatureKey[];
  remainingProjects?: number;
  remainingUsers?: number;
};

export function parseFeatures(raw: string | null | undefined): FeatureKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is FeatureKey => FEATURE_KEYS.includes(f as FeatureKey));
  } catch {
    return [];
  }
}

export function hasFeature(client: LicenseClient | null | undefined, feature: FeatureKey): boolean {
  if (!client) return false;
  return parseFeatures(client.features).includes(feature);
}

/**
 * 고객사 라이선스를 실시간 검증한다. (프로젝트/사용자 한도, 만료, 기능 포함 여부)
 */
export function evaluateLicense(
  client: LicenseClient | null | undefined,
  usage: { projectCount?: number; userCount?: number; feature?: FeatureKey; now?: Date } = {},
): LicenseResult {
  const now = usage.now ?? new Date();
  if (!client) {
    return {
      ok: false,
      code: "NO_CLIENT",
      reason: "고객사 라이선스가 연결되지 않았습니다. 관리자에게 고객사 배정을 요청하세요.",
      features: [],
    };
  }
  const features = parseFeatures(client.features);
  const expires = new Date(client.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() < now.getTime()) {
    return {
      ok: false,
      code: "LICENSE_EXPIRED",
      reason: `라이선스가 ${expires.toISOString().slice(0, 10)} 에 만료되었습니다. 갱신 후 다시 시도하세요.`,
      features,
      remainingProjects: 0,
      remainingUsers: 0,
    };
  }
  const projectCount = usage.projectCount ?? 0;
  if (projectCount >= client.maxProjects) {
    return {
      ok: false,
      code: "PROJECT_LIMIT",
      reason: `프로젝트 한도(${client.maxProjects}개)에 도달했습니다. 플랜을 상향하거나 기존 프로젝트를 정리하세요.`,
      features,
      remainingProjects: 0,
      remainingUsers: Math.max(0, client.maxUsers - (usage.userCount ?? 0)),
    };
  }
  const userCount = usage.userCount ?? 0;
  if (userCount >= client.maxUsers) {
    return {
      ok: false,
      code: "USER_LIMIT",
      reason: `사용자 한도(${client.maxUsers}명)에 도달했습니다.`,
      features,
      remainingProjects: Math.max(0, client.maxProjects - projectCount),
      remainingUsers: 0,
    };
  }
  if (usage.feature && !features.includes(usage.feature)) {
    return {
      ok: false,
      code: "FEATURE_NOT_INCLUDED",
      reason: `현재 플랜(${client.plan})에는 '${usage.feature}' 기능이 포함되어 있지 않습니다.`,
      features,
      remainingProjects: Math.max(0, client.maxProjects - projectCount),
      remainingUsers: Math.max(0, client.maxUsers - userCount),
    };
  }
  return {
    ok: true,
    code: "OK",
    reason: "라이선스 검증 통과",
    features,
    remainingProjects: Math.max(0, client.maxProjects - projectCount),
    remainingUsers: Math.max(0, client.maxUsers - userCount),
  };
}

export function licenseSummary(client: LicenseClient | null | undefined) {
  if (!client) {
    return { plan: "NONE", label: "미배정", expiresAt: null, features: [] as FeatureKey[], expired: true };
  }
  const features = parseFeatures(client.features);
  return {
    plan: client.plan,
    label: client.plan,
    expiresAt: new Date(client.expiresAt).toISOString(),
    features,
    expired: new Date(client.expiresAt).getTime() < Date.now(),
  };
}
