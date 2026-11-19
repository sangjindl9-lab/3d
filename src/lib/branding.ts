import { FEATURE_KEYS, PLAN_PRESETS, type FeatureKey } from "./constants";

export type BrandingInput = Record<string, unknown>;

export type NormalizeResult = { data: Record<string, unknown>; error?: string };

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * 화이트라벨 브랜딩 입력 정규화.
 * 고객사 관리자는 브랜딩 필드만, 시스템 관리자는 라이선스 필드까지 변경할 수 있다.
 */
export function normalizeBranding(body: BrandingInput, options: { allowLicense: boolean }): NormalizeResult {
  const data: Record<string, unknown> = {};
  if (typeof body.primaryColor === "string") {
    if (!COLOR.test(body.primaryColor)) return { data, error: "포인트 컬러는 #RRGGBB 형식이어야 합니다." };
    data.primaryColor = body.primaryColor;
  }
  if (typeof body.accentColor === "string") {
    if (!COLOR.test(body.accentColor)) return { data, error: "보조 컬러는 #RRGGBB 형식이어야 합니다." };
    data.accentColor = body.accentColor;
  }
  if (typeof body.slogan === "string") data.slogan = body.slogan.trim().slice(0, 120);
  if (typeof body.headerText === "string") data.headerText = body.headerText.trim().slice(0, 120);
  if (typeof body.footerText === "string") data.footerText = body.footerText.trim().slice(0, 160);

  if (options.allowLicense) {
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
    if (typeof body.contactEmail === "string") data.contactEmail = body.contactEmail.trim().slice(0, 120);
    if (typeof body.businessNo === "string") data.businessNo = body.businessNo.trim().slice(0, 30);
    if (typeof body.plan === "string") {
      if (!PLAN_PRESETS[body.plan]) return { data, error: "알 수 없는 플랜입니다." };
      data.plan = body.plan;
      data.maxProjects = PLAN_PRESETS[body.plan].maxProjects;
      data.maxUsers = PLAN_PRESETS[body.plan].maxUsers;
      data.features = JSON.stringify(PLAN_PRESETS[body.plan].features);
    }
    if (typeof body.expiresAt === "string") {
      const date = new Date(body.expiresAt);
      if (Number.isNaN(date.getTime())) return { data, error: "만료일이 올바르지 않습니다." };
      data.expiresAt = date;
    }
    if (typeof body.maxProjects === "number") {
      if (!Number.isFinite(body.maxProjects) || body.maxProjects < 1) return { data, error: "최대 프로젝트 수가 올바르지 않습니다." };
      data.maxProjects = Math.round(body.maxProjects);
    }
    if (typeof body.maxUsers === "number") {
      if (!Number.isFinite(body.maxUsers) || body.maxUsers < 1) return { data, error: "최대 사용자 수가 올바르지 않습니다." };
      data.maxUsers = Math.round(body.maxUsers);
    }
    if (Array.isArray(body.features)) {
      data.features = JSON.stringify(body.features.filter((f): f is FeatureKey => FEATURE_KEYS.includes(f as FeatureKey)));
    }
  }
  return { data };
}

export function brandInitial(name: string): string {
  return name.trim().slice(0, 1) || "E";
}
