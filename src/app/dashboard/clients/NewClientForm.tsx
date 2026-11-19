"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_PRESETS } from "@/lib/constants";

export default function NewClientForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", plan: "STARTER", expiresAt: "", contactEmail: "", businessNo: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "고객사 등록 실패");
      setOpen(false);
      setForm({ name: "", plan: "STARTER", expiresAt: "", contactEmail: "", businessNo: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "고객사 등록 실패");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + 고객사 등록
      </button>
    );
  }

  return (
    <div className="card w-full p-4">
      <p className="text-[12px] font-bold">새 고객사 등록</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div>
          <label className="label">고객사명 *</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 대한정밀기계" />
        </div>
        <div>
          <label className="label">플랜</label>
          <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {Object.entries(PLAN_PRESETS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label} (프로젝트 {value.maxProjects} · 사용자 {value.maxUsers})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">만료일</label>
          <input type="date" className="input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>
        <div>
          <label className="label">담당 이메일</label>
          <input className="input" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        </div>
      </div>
      {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          취소
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
    </div>
  );
}
