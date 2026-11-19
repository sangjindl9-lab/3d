"use client";

import dynamic from "next/dynamic";
import type { ShowroomPayload } from "@/lib/showroom-data";

const ShowroomShell = dynamic(() => import("./ShowroomShell"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[100dvh] place-items-center bg-[#05080f] text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300" />
        <span className="text-xs">3D 쇼룸 엔진을 불러오는 중…</span>
      </div>
    </div>
  ),
});

export default function ShowroomClient({ payload, mode, homeHref }: { payload: ShowroomPayload; mode: "editor" | "share"; homeHref?: string }) {
  return <ShowroomShell payload={payload} mode={mode} homeHref={homeHref} />;
}
