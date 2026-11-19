import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canViewProject } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { buildShowroomPayload } from "@/lib/showroom-data";
import ShowroomClient from "@/components/showroom/ShowroomClient";
import { industryLabel } from "@/lib/constants";

export default async function ProjectEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/dashboard/projects/${id}`);
  const raw = await prisma.project.findUnique({ where: { id } });
  if (!raw) notFound();
  if (!canViewProject(user, { ownerId: raw.ownerId, clientId: raw.clientId, isDemo: raw.isDemo })) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-sm font-bold text-rose-300">열람 권한이 없습니다</p>
          <p className="mt-2 text-xs text-slate-500">이 프로젝트는 다른 고객사에 속해 있습니다.</p>
          <Link href="/dashboard" className="btn btn-ghost mt-4">
            대시보드로
          </Link>
        </div>
      </div>
    );
  }

  const payload = await buildShowroomPayload(id, { actor: { id: user.id, role: user.role, clientId: user.clientId } });
  if (!payload) notFound();

  if (!payload.availability.ok || !payload.project.modelUrl) {
    const run = await prisma.pipelineRun.findFirst({ where: { projectId: id }, orderBy: { startedAt: "desc" }, include: { stages: { orderBy: { step: "asc" } } } });
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Link href="/dashboard" className="hover:text-slate-200">
            대시보드
          </Link>
          <span>/</span>
          <span>{payload.project.title}</span>
        </div>
        <div className="card mt-4 p-6">
          <span className="badge badge-warn">{payload.project.status}</span>
          <h1 className="mt-3 text-xl font-black">{payload.project.title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{payload.availability.reason}</p>
          <div className="mt-5 space-y-1.5">
            {(run?.stages ?? []).map((stage) => (
              <div key={stage.id} className="flex items-start gap-2 text-[11px]">
                <span className={stage.status === "OK" ? "text-teal-300" : stage.status === "WARN" ? "text-amber-300" : stage.status === "FAILED" ? "text-rose-300" : "text-slate-600"}>
                  {stage.status === "OK" ? "✓" : stage.status === "WARN" ? "!" : stage.status === "FAILED" ? "✕" : "·"}
                </span>
                <span className="w-40 flex-none text-slate-400">{stage.label}</span>
                <span className="text-slate-500">{stage.detail}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-2">
            <Link href="/dashboard/projects/new" className="btn btn-primary">
              다른 파일로 새로 만들기
            </Link>
            <Link href="/dashboard" className="btn btn-ghost">
              대시보드
            </Link>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 p-4 text-[11px] leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-300">{industryLabel(payload.project.industry)} · {payload.project.sourceType} 파일</p>
          <p className="mt-1">
            STEP/IGES/FBX/3MF/IFC 및 SolidWorks·Inventor·CATIA·NX·Creo·SketchUp 은 형식·메타 분석까지만 지원하며, 표준 GLB 변환은 외부
            CAD 변환기가 필요합니다. GLB·GLTF·STL·OBJ 는 서버에서 직접 변환됩니다.
          </p>
        </div>
      </div>
    );
  }

  return <ShowroomClient payload={payload} mode="editor" homeHref="/dashboard" />;
}
