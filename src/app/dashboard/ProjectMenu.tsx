"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProjectMenu({ id, shareSlug }: { id: string; shareSlug: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = async () => {
    if (!confirm("이 쇼룸 프로젝트를 삭제할까요? 복구할 수 없습니다.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "삭제에 실패했습니다.");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const copy = async () => {
    if (!shareSlug) return;
    await navigator.clipboard?.writeText(`${window.location.origin}/share/${shareSlug}`);
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5">
        ⋯
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-white/15 bg-[#0b1420] py-1 shadow-2xl">
          {shareSlug ? (
            <button type="button" onClick={copy} className="block w-full px-3 py-2 text-left text-[11px] text-slate-300 hover:bg-white/5">
              공유 링크 복사
            </button>
          ) : null}
          <a href={`/dashboard/projects/${id}`} className="block px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5">
            쇼룸 편집
          </a>
          <button type="button" onClick={remove} className="block w-full px-3 py-2 text-left text-[11px] text-rose-300 hover:bg-rose-500/10">
            프로젝트 삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}
