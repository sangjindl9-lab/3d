"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "로그인에 실패했습니다.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">이메일</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@eum3d.kr" required autoComplete="email" />
      </div>
      <div>
        <label className="label">비밀번호</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
      </div>
      {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "로그인 중…" : "로그인"}
      </button>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <Link href="/signup" className="hover:text-teal-200">
          회원가입
        </Link>
        <Link href="/" className="hover:text-slate-200">
          데모 쇼룸 둘러보기 →
        </Link>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-400">데모 계정</p>
        <p className="mono mt-1">admin@eum3d.kr / Eum3d!2026</p>
        <p className="mono">ss@eum3d.kr / SsPower!2026 (고객사 관리자)</p>
      </div>
    </form>
  );
}
