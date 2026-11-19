import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-white/10 lg:block">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-teal-400/10 via-transparent to-sky-500/10" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-sky-400 text-[15px] font-black text-[#04121a]">E</span>
            <span className="text-sm font-black tracking-tight">EUM 3D SHOWROOM PRO</span>
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-300/80">Industrial 3D Showroom</p>
            <h1 className="mt-4 text-4xl font-black leading-tight">
              도면과 CAD를
              <br />
              고객이 이해하는
              <br />
              <span className="bg-gradient-to-r from-teal-300 to-sky-400 bg-clip-text text-transparent">3D 쇼룸</span>으로.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              업로드 → 자동 변환 → 분해도 · 조립/금형/기계 애니메이션 → 영상·이미지·공유 링크까지. 5대 산업군 프리셋 제공.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-slate-500">
            <div>
              <p className="mono text-lg font-bold text-slate-200">20</p>
              <p>핵심 기능</p>
            </div>
            <div>
              <p className="mono text-lg font-bold text-slate-200">10</p>
              <p>변환 파이프라인</p>
            </div>
            <div>
              <p className="mono text-lg font-bold text-slate-200">7</p>
              <p>쇼룸 템플릿</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-black">로그인</h2>
          <p className="mt-1 text-xs text-slate-500">EUM 3D SHOWROOM PRO 관리 콘솔</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
