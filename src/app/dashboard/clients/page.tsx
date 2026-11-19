import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManageLicense } from "@/lib/permissions";
import { parseFeatures } from "@/lib/license";
import { fileUrl } from "@/lib/storage";
import NewClientForm from "./NewClientForm";

export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    if (!user.clientId) {
      return (
        <div className="mx-auto max-w-xl px-6 py-16 text-center">
          <p className="text-sm font-bold">고객사가 배정되지 않았습니다</p>
          <p className="mt-2 text-xs text-slate-500">시스템 관리자에게 고객사 배정을 요청하세요.</p>
        </div>
      );
    }
    redirect(`/dashboard/clients/${user.clientId}`);
  }

  const clients = await prisma.client.findMany({
    include: { _count: { select: { users: true, projects: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Clients & Licensing</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">고객사 · 라이선스</h1>
          <p className="mt-1 text-xs text-slate-500">고객사별 플랜·만료·한도·허용 기능과 화이트라벨 브랜딩을 관리합니다.</p>
        </div>
        <NewClientForm />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => {
          const expired = client.expiresAt.getTime() < Date.now();
          const projectPct = Math.min(100, Math.round((client._count.projects / Math.max(1, client.maxProjects)) * 100));
          const userPct = Math.min(100, Math.round((client._count.users / Math.max(1, client.maxUsers)) * 100));
          return (
            <Link key={client.id} href={`/dashboard/clients/${client.id}`} className="card p-4 transition hover:border-teal-300/30">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {fileUrl(client.logoPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(client.logoPath)!} alt={client.name} className="h-7 max-w-[80px] object-contain" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-lg text-[11px] font-black text-[#04121a]" style={{ background: client.primaryColor }}>
                      {client.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold">{client.name}</p>
                    <p className="text-[10px] text-slate-500">{client.plan} · {expired ? "만료" : `${client.expiresAt.toLocaleDateString("ko-KR")} 만료`}</p>
                  </div>
                </div>
                <span className={`badge !text-[9px] ${expired ? "badge-danger" : "badge-accent"}`}>{expired ? "만료" : "활성"}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>프로젝트</span>
                    <span className="mono">
                      {client._count.projects}/{client.maxProjects}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-teal-400/70" style={{ width: `${projectPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>사용자</span>
                    <span className="mono">
                      {client._count.users}/{client.maxUsers}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${userPct}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {parseFeatures(client.features)
                  .slice(0, 5)
                  .map((f) => (
                    <span key={f} className="badge !text-[9px]">
                      {f}
                    </span>
                  ))}
                {parseFeatures(client.features).length > 5 ? <span className="badge !text-[9px]">+{parseFeatures(client.features).length - 5}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-300">라이선스 실시간 검증 안내</p>
        <p className="mt-1">
          프로젝트 생성 시 프로젝트 한도, 사용자 초대 시 사용자 한도, 공유/QR/영상/주석/투시 등 기능 사용 시 허용 기능을 서버에서 검증합니다.
          만료된 고객사는 새 프로젝트 생성과 공유 링크 발급이 차단됩니다.
        </p>
        {!canManageLicense(user) ? null : <p className="mt-1">고객사 상세에서 플랜·만료일·한도·기능을 즉시 변경할 수 있습니다.</p>}
      </div>
    </div>
  );
}
