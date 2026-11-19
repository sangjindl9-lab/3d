"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ShareGate({ slug, title, clientName, accent }: { slug: string; title: string; clientName: string | null; accent: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/share/${slug}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "비밀번호가 올바르지 않습니다.");
      setBusy(false);
      return;
    }
    router.refresh();
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: accent }}>
            {clientName ?? "EUM 3D SHOWROOM PRO"}
          </p>
          <h1 className="mt-2 text-xl font-black">{title}</h1>
          <p className="mt-1 text-xs text-slate-500">비밀번호로 보호된 쇼룸입니다.</p>
        </div>
        <form onSubmit={submit} className="card space-y-3 p-5">
          <div>
            <label className="label">비밀번호</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          </div>
          {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">{error}</p> : null}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "확인 중…" : "쇼룸 열기"}
          </button>
          <p className="text-center text-[10px] text-slate-600">이 링크는 읽기 전용이며 편집 도구가 제공되지 않습니다.</p>
        </form>
      </div>
    </div>
  );
}
