import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { roleLabel } from "@/lib/permissions";
import DashboardNav from "./DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="hidden md:flex">
        <DashboardNav userName={user.name} roleLabel={roleLabel(user.role)} clientName={user.client?.name ?? null} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-300 to-sky-400 text-[12px] font-black text-[#04121a]">E</span>
            <span className="text-[11px] font-black">EUM 3D</span>
          </div>
          <div className="hidden text-[11px] text-slate-500 md:block">
            {user.client ? (
              <>
                {user.client.name} · {user.client.plan} 플랜 · 만료 {new Date(user.client.expiresAt).toLocaleDateString("ko-KR")}
              </>
            ) : (
              "고객사 라이선스 미배정 — 프로젝트 생성은 관리자 배정 후 가능합니다."
            )}
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="btn btn-ghost btn-sm">
              데모 쇼룸
            </a>
            <a href="/dashboard/projects/new" className="btn btn-primary btn-sm">
              새 쇼룸 만들기
            </a>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
