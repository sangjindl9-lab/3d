// EUM 3D SHOWROOM PRO — 공용 상수 (업종, 템플릿, 라이선스 기능)

export type IndustryKey = "MOLD" | "MACHINE" | "ELECTRIC" | "ARCHITECTURE" | "MANUFACTURING";

export type IndustryPreset = {
  key: IndustryKey;
  label: string;
  icon: string;
  summary: string;
  categories: string[];
  defaultTemplate: string;
  accent: string;
  sampleProject: string;
};

export const INDUSTRIES: IndustryPreset[] = [
  {
    key: "MOLD",
    label: "금형 제조업",
    icon: "◈",
    summary: "사출·프레스·다이캐스팅 금형의 개폐 시퀀스와 코어/캐비티 구조를 그대로 보여줍니다.",
    categories: ["사출금형", "프레스금형", "다이캐스팅금형", "정밀금형", "금형 조립체", "금형 부품"],
    defaultTemplate: "MOLD_TECH",
    accent: "#f59e0b",
    sampleProject: "사출금형 개폐 데모",
  },
  {
    key: "MACHINE",
    label: "기계·산업장비",
    icon: "⚙",
    summary: "감속기·CNC·자동화 설비를 분해도와 작동 애니메이션으로 설명합니다.",
    categories: [
      "산업용 기계",
      "CNC 장비",
      "자동화 설비",
      "생산라인",
      "컨베이어",
      "로봇 장비",
      "유압·공압 장비",
      "포장기계",
      "검사기계",
      "모터·감속기",
    ],
    defaultTemplate: "INDUSTRIAL",
    accent: "#38bdf8",
    sampleProject: "산업용 기어 감속기 분해 데모",
  },
  {
    key: "ELECTRIC",
    label: "전기·정보통신",
    icon: "⚡",
    summary: "분전반·제어반·서버랙의 내부 배치를 X-Ray 투시와 라벨로 확인시킵니다.",
    categories: [
      "분전반",
      "배전반",
      "제어반",
      "UPS",
      "통신랙",
      "서버랙",
      "NVR/DVR",
      "CCTV",
      "네트워크 장비",
      "광통신 설비",
      "케이블트레이",
    ],
    defaultTemplate: "ELECTRONICS",
    accent: "#a3e635",
    sampleProject: "전기 분전반 내부투시 데모",
  },
  {
    key: "ARCHITECTURE",
    label: "건축·설비",
    icon: "▤",
    summary: "플랜트 배관·덕트·기계실을 단면과 단계별 시공 순서로 보여줍니다.",
    categories: ["건축물", "공장", "기계실", "플랜트", "배관", "덕트", "구조물"],
    defaultTemplate: "ARCHITECTURE",
    accent: "#c084fc",
    sampleProject: "건축 플랜트 배관 데모",
  },
  {
    key: "MANUFACTURING",
    label: "일반 제조업",
    icon: "▦",
    summary: "자동차·전자·판금·사출 부품을 2D 도면에서 참고용 3D로 빠르게 제안합니다.",
    categories: [
      "자동차 부품",
      "전자제품",
      "가전제품",
      "판금 제품",
      "플라스틱 사출품",
      "산업용 케이스",
      "조립식 제품",
    ],
    defaultTemplate: "PRODUCT",
    accent: "#2dd4bf",
    sampleProject: "2D 도면 참고용 AI 3D 시각화 데모",
  },
];

export function industryLabel(key: string): string {
  return INDUSTRIES.find((i) => i.key === key)?.label ?? key;
}

export function industryPreset(key: string): IndustryPreset {
  return INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES[4];
}

export type ShowroomTemplate = {
  key: string;
  label: string;
  tagline: string;
  background: string;
  accent: string;
  floorColor: string;
  envIntensity: number;
  keyLight: string;
  rimLight: string;
  exposure: number;
};

export const TEMPLATES: ShowroomTemplate[] = [
  {
    key: "SHOWCASE",
    label: "고급 제품 전시관",
    tagline: "딥 그레이 스튜디오 + 소프트 스포트",
    background: "STUDIO",
    accent: "#d4b483",
    floorColor: "#15181d",
    envIntensity: 1.15,
    keyLight: "#fff4e0",
    rimLight: "#8fb6ff",
    exposure: 1.05,
  },
  {
    key: "INDUSTRIAL",
    label: "산업용 기계 쇼룸",
    tagline: "공장 조명 + 콘크리트 바닥",
    background: "FACTORY",
    accent: "#f59e0b",
    floorColor: "#2a2d31",
    envIntensity: 0.85,
    keyLight: "#ffe9c4",
    rimLight: "#7dd3fc",
    exposure: 1.0,
  },
  {
    key: "MOLD_TECH",
    label: "금형 기술설명 쇼룸",
    tagline: "테크니컬 블루 + 정밀 조명",
    background: "DARK",
    accent: "#38bdf8",
    floorColor: "#101820",
    envIntensity: 0.95,
    keyLight: "#e0f2fe",
    rimLight: "#38bdf8",
    exposure: 1.1,
  },
  {
    key: "ELECTRONICS",
    label: "전자제품 쇼룸",
    tagline: "클린 룸 + 쿨 라이트",
    background: "WHITE",
    accent: "#22d3ee",
    floorColor: "#e8edf2",
    envIntensity: 1.35,
    keyLight: "#ffffff",
    rimLight: "#a5f3fc",
    exposure: 1.0,
  },
  {
    key: "ARCHITECTURE",
    label: "건축물 쇼룸",
    tagline: "야외 앰비언트 + 대형 스케일",
    background: "STUDIO",
    accent: "#c084fc",
    floorColor: "#1b1a22",
    envIntensity: 1.0,
    keyLight: "#ffe8d1",
    rimLight: "#c4b5fd",
    exposure: 1.05,
  },
  {
    key: "DARK_STUDIO",
    label: "다크 스튜디오",
    tagline: "블랙 미러 + 림 라이트",
    background: "DARK",
    accent: "#f472b6",
    floorColor: "#08090b",
    envIntensity: 0.65,
    keyLight: "#ffffff",
    rimLight: "#f472b6",
    exposure: 0.95,
  },
  {
    key: "WHITE_STUDIO",
    label: "화이트 스튜디오",
    tagline: "소프트 화이트 + 하이키",
    background: "WHITE",
    accent: "#2563eb",
    floorColor: "#f4f6f8",
    envIntensity: 1.45,
    keyLight: "#ffffff",
    rimLight: "#dbeafe",
    exposure: 1.0,
  },
];

export function templateByKey(key: string): ShowroomTemplate {
  return TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
}

export const BACKGROUNDS = [
  { key: "STUDIO", label: "고급 스튜디오 배경" },
  { key: "FACTORY", label: "공장 배경" },
  { key: "WHITE", label: "흰색 배경" },
  { key: "TRANSPARENT", label: "투명 배경" },
] as const;

export type BackgroundKey = (typeof BACKGROUNDS)[number]["key"];

export const FEATURE_KEYS = [
  "SHARE",
  "QR",
  "VIDEO",
  "SNAPSHOT",
  "ANNOTATION",
  "EXPLODE",
  "MOLD_ANIM",
  "MACHINE_ANIM",
  "XRAY",
  "WHITELABEL",
  "API",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  SHARE: "공유 링크",
  QR: "QR 코드",
  VIDEO: "MP4/WebM 동영상",
  SNAPSHOT: "고해상도 이미지",
  ANNOTATION: "3D 주석",
  EXPLODE: "분해도",
  MOLD_ANIM: "금형 개폐 애니메이션",
  MACHINE_ANIM: "기계 작동 애니메이션",
  XRAY: "내부 투시",
  WHITELABEL: "화이트라벨",
  API: "API 연동",
};

export const PLAN_PRESETS: Record<
  string,
  { label: string; maxProjects: number; maxUsers: number; features: FeatureKey[] }
> = {
  STARTER: {
    label: "스타터",
    maxProjects: 5,
    maxUsers: 3,
    features: ["SHARE", "QR", "SNAPSHOT", "EXPLODE", "XRAY", "ANNOTATION"],
  },
  PROFESSIONAL: {
    label: "프로페셔널",
    maxProjects: 30,
    maxUsers: 15,
    features: [
      "SHARE",
      "QR",
      "SNAPSHOT",
      "EXPLODE",
      "XRAY",
      "ANNOTATION",
      "VIDEO",
      "MOLD_ANIM",
      "MACHINE_ANIM",
      "WHITELABEL",
    ],
  },
  ENTERPRISE: {
    label: "엔터프라이즈",
    maxProjects: 200,
    maxUsers: 100,
    features: [
      "SHARE",
      "QR",
      "SNAPSHOT",
      "EXPLODE",
      "XRAY",
      "ANNOTATION",
      "VIDEO",
      "MOLD_ANIM",
      "MACHINE_ANIM",
      "WHITELABEL",
      "API",
    ],
  },
};

export const ROLES = ["ADMIN", "CLIENT_ADMIN", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const PART_MATERIALS = [
  { key: "STEEL", label: "탄소강 (S45C)", color: "#9aa4b2", metalness: 0.95, roughness: 0.28 },
  { key: "STAINLESS", label: "스테인리스 (SUS304)", color: "#c7ced6", metalness: 1.0, roughness: 0.18 },
  { key: "ALUMINUM", label: "알루미늄 (AL6061)", color: "#cdd5dd", metalness: 0.85, roughness: 0.35 },
  { key: "BRASS", label: "황동 (C3604)", color: "#c9a227", metalness: 0.9, roughness: 0.25 },
  { key: "PLASTIC", label: "엔지니어링 플라스틱", color: "#2f6f8f", metalness: 0.05, roughness: 0.55 },
  { key: "GLASS", label: "강화유리", color: "#a8d8e8", metalness: 0.1, roughness: 0.05, opacity: 0.35 },
  { key: "PAINT", label: "분체도장 (RAL7035)", color: "#b9c0c7", metalness: 0.2, roughness: 0.6 },
  { key: "COPPER", label: "동 (C1100)", color: "#b87333", metalness: 0.95, roughness: 0.3 },
] as const;

export function materialPreset(key: string) {
  return PART_MATERIALS.find((m) => m.key === key) ?? PART_MATERIALS[0];
}

export const UNIT_NOTE = "단위: mm (2D 도면 해석 기준)";
