import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { evaluateLicense, parseFeatures } from "@/lib/license";
import { industryLabel } from "@/lib/constants";
import { fileUrl } from "@/lib/storage";
import ProjectMenu from "./ProjectMenu";

const STATUS: Record<string, { label: string; className: string }> = {
  READY: { label: "준비 완료", className: "badge-accent" },
  DRAFT: { label: "초안", className: "" },
  PROCESSING: { label: "변환 중", className: "badge-warn" },
  CONVERT_REQUIRED: { label: "변환기 필요", className: "badge-warn" },
  FAILED: { label: "실패", className: "badge-danger" },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projectWhere =
    user.role === "ADMIN"
      ? {}
      : { OR: [{ clientId: user.clientId ?? "none" }, { ownerId: user.id }, { isDemo: true }] };

  const [projects, projectCount, userCount, shareLinks] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      include: { client: true, _count: { select: { parts: true } }, shareLinks: { where: { isActive: true }, take: 1 } },
      orderBy: [{ isDemo: "desc" }, { updatedAt: "desc" }],
      take: 30,
    }),
    user.clientId ? prisma.project.count({ where: { clientId: user.clientId } }) : Promise.resolve(0),
    user.clientId ? prisma.user.count({ where: { clientId: user.clientId } }) : Promise.resolve(0),
    prisma.shareLink.count({ where: { isActive: true, project: { clientId: user.clientId ?? "none" } } }),
  ]);

  const license = user.client ? evaluateLicense(user.client, { projectCount, userCount }) : null;
  const features = user.client ? parseFeatures(user.client.features) : [];
  const own = projects.filter((p) => !p.isDemo);
  const demos = projects.filter((p) => p.isDemo);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Dashboard</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {user.name}님, 반갑습니다
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {user.role === "ADMIN" ? "전체 고객사·프로젝트를 관리합니다." : user.client ? `${user.client.name}의 3D 쇼룸 워크스페이스` : "고객사 배정 대기 중입니다."}
          </p>
        </div>
        <Link href="/dashboard/projects/new" className="btn btn-primary">
          + 새 3D 쇼룸 만들기
        </Link>
      </div>

      {license && !license.ok && license.code !== "OK" ? (
        <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-100">
          <span className="font-bold">라이선스 알림</span> · {license.reason}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">라이선스</p>
          <p className="mt-1 text-lg font-black text-teal-200">{user.client ? `${user.client.plan}` : "미배정"}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {user.client ? `${new Date(user.client.expiresAt).toLocaleDateString("ko-KR")} 만료` : "관리자에게 문의"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">프로젝트</p>
          <p className="mt-1 text-lg font-black">
            {projectCount}
            <span className="text-xs font-medium text-slate-500"> / {user.client?.maxProjects ?? "-"}</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-sky-400" style={{ width: `${user.client ? Math.min(100, (projectCount / user.client.maxProjects) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">사용자</p>
          <p className="mt-1 text-lg font-black">
            {userCount}
            <span className="text-xs font-medium text-slate-500"> / {user.client?.maxUsers ?? "-"}</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-indigo-400" style={{ width: `${user.client ? Math.min(100, (userCount / user.client.maxUsers) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="card p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">활성 공유 링크</p>
          <p className="mt-1 text-lg font-black">{shareLinks}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">기능 {features.length}종 사용 가능</p>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black tracking-tight">내 쇼룸 프로젝트</h2>
          <Link href="/dashboard/projects/new" className="text-[11px] text-teal-300 hover:underline">
            새로 만들기 →
          </Link>
        </div>
        {own.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/12 p-10 text-center">
            <p className="text-sm font-semibold text-slate-300">아직 만든 쇼룸이 없습니다</p>
            <p className="mt-1 text-xs text-slate-500">CAD·도면을 업로드하면 10단계 파이프라인이 3D 쇼룸을 자동 생성합니다.</p>
            <Link href="/dashboard/projects/new" className="btn btn-primary mt-4">
              첫 쇼룸 만들기
            </Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {own.map((project) => {
              const status = STATUS[project.status] ?? STATUS.DRAFT;
              const thumbBase = fileUrl(project.thumbnailPath);
              // 썸네일은 같은 경로로 재생성되므로 갱신 시각을 붙여 브라우저 캐시를 무효화한다.
              const thumb = thumbBase ? `${thumbBase}?v=${project.updatedAt.getTime()}` : null;
              return (
                <div key={project.id} className="card group overflow-hidden">
                  <Link href={`/dashboard/projects/${project.id}`} className="block">
                    <div className="relative aspect-[16/9] overflow-hidden bg-[#0a111b]">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={project.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="grid h-full place-items-center text-3xl text-slate-700">◫</div>
                      )}
                      <div className="absolute left-2 top-2 flex gap-1">
                        <span className={`badge ${status.className}`}>{status.label}</span>
                        {project.isAiReference ? <span className="badge badge-warn">AI 참고용</span> : null}
                      </div>
                    </div>
                  </Link>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/dashboard/projects/${project.id}`} className="block truncate text-[13px] font-bold hover:text-teal-200">
                          {project.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">
                          {industryLabel(project.industry)} · 부품 {project._count.parts}개
                          {project.client ? ` · ${project.client.name}` : ""}
                        </p>
                      </div>
                      <ProjectMenu id={project.id} shareSlug={project.shareLinks[0]?.slug ?? null} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-600">{new Date(project.updatedAt).toLocaleDateString("ko-KR")}</span>
                      <div className="flex gap-1">
                        {project.shareLinks[0] ? (
                          <Link href={`/share/${project.shareLinks[0].slug}`} className="btn btn-ghost btn-sm !px-2 !text-[10px]">
                            공유
                          </Link>
                        ) : null}
                        <Link href={`/dashboard/projects/${project.id}`} className="btn btn-ghost btn-sm !px-2 !text-[10px]">
                          열기
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight">업종별 데모 쇼룸</h2>
            <p className="text-[11px] text-slate-500">로그인 없이 공유 가능한 프리셋입니다. 복제하거나 참고하세요.</p>
          </div>
          <Link href="/" className="text-[11px] text-teal-300 hover:underline">
            전체 보기 →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map((project) => (
            <div key={project.id} className="card overflow-hidden">
              <Link href={`/dashboard/projects/${project.id}`}>
                <div className="relative aspect-[16/9] bg-[#0a111b]">
                  {fileUrl(project.thumbnailPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${fileUrl(project.thumbnailPath)!}?v=${project.updatedAt.getTime()}`} alt={project.title} className="h-full w-full object-cover" />
                  ) : null}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className="badge badge-accent">데모</span>
                    {project.isAiReference ? <span className="badge badge-warn">AI 참고용</span> : null}
                  </div>
                </div>
              </Link>
              <div className="p-3">
                <p className="truncate text-[12px] font-bold">{project.title}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {industryLabel(project.industry)} · {project.client?.name}
                </p>
                <div className="mt-2 flex gap-1">
                  <Link href={`/dashboard/projects/${project.id}`} className="btn btn-ghost btn-sm flex-1 !text-[10px]">
                    쇼룸 열기
                  </Link>
                  {project.shareLinks[0] ? (
                    <Link href={`/share/${project.shareLinks[0].slug}`} className="btn btn-primary btn-sm flex-1 !text-[10px]">
                      공유 페이지
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
