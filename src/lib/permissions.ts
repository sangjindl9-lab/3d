export type Actor = {
  id: string;
  role: string;
  clientId: string | null;
};

export type ProjectRef = {
  ownerId: string | null;
  clientId: string | null;
  isDemo?: boolean;
};

/** 로그인 사용자의 프로젝트 열람 권한 */
export function canViewProject(actor: Actor | null, project: ProjectRef): boolean {
  if (project.isDemo) return true;
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (project.clientId && actor.clientId && project.clientId === actor.clientId) return true;
  if (project.ownerId === actor.id) return true;
  return false;
}

/** 편집(쇼룸 장면 저장) 권한 — 원본 파일은 이 권한으로도 수정되지 않는다. */
export function canEditProject(actor: Actor | null, project: ProjectRef): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  if (project.clientId && actor.clientId && project.clientId === actor.clientId) {
    if (actor.role === "CLIENT_ADMIN") return true;
    return project.ownerId === actor.id;
  }
  return false;
}

export function canManageClient(actor: Actor | null, clientId: string): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  return actor.role === "CLIENT_ADMIN" && actor.clientId === clientId;
}

export function canManageLicense(actor: Actor | null): boolean {
  return actor?.role === "ADMIN";
}

export function canManageUsers(actor: Actor | null, clientId: string): boolean {
  if (!actor) return false;
  if (actor.role === "ADMIN") return true;
  return actor.role === "CLIENT_ADMIN" && actor.clientId === clientId;
}

export function roleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "시스템 관리자";
    case "CLIENT_ADMIN":
      return "고객사 관리자";
    default:
      return "사용자";
  }
}
