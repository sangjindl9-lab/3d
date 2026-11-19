"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", companyCode: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "회원가입에 실패했습니다.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className="label">이름</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" required />
      </div>
      <div>
        <label className="label">이메일</label>
        <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.co.kr" required />
      </div>
      <div>
        <label className="label">비밀번호 (영문+숫자 8자 이상)</label>
        <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required />
      </div>
      <div>
        <label className="label">고객사 코드 (선택)</label>
        <input className="input" value={form.companyCode} onChange={(e) => setForm({ ...form, companyCode: e.target.value })} placeholder="예: ss-power" />
        <p className="mt-1 text-[10px] text-slate-500">고객사 코드를 입력하면 해당 고객사 라이선스 사용자로 등록됩니다. (예: ss-power, hanbit-mold)</p>
      </div>
      {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "가입 중…" : "계정 만들기"}
      </button>
      <p className="text-center text-xs text-slate-500">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-teal-300 hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
