"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "대시보드", icon: "◧" },
  { href: "/dashboard/projects/new", label: "새 쇼룸", icon: "＋" },
  { href: "/dashboard/clients", label: "고객사 · 브랜딩", icon: "◈" },
  { href: "/dashboard/guide", label: "지원 형식 · 안내", icon: "◇" },
];

export default function DashboardNav({ userName, roleLabel, clientName }: { userName: string; roleLabel: string; clientName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex w-[228px] flex-none flex-col border-r border-white/10 bg-[#070c14]/80 md:w-[248px]">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-sky-400 text-[14px] font-black text-[#04121a]">E</span>
        <span>
          <span className="block text-[12px] font-black leading-tight tracking-tight">EUM 3D</span>
          <span className="block text-[9px] uppercase tracking-[0.18em] text-slate-500">Showroom Pro</span>
        </span>
      </Link>
      <nav className="mt-1 flex-1 space-y-1 px-3">
        {links.map((link) => {
          const active = link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] transition ${active ? "bg-teal-400/12 font-bold text-teal-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}>
              <span className="text-[13px] opacity-80">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="truncate text-[11px] font-bold text-slate-200">{userName}</p>
          <p className="truncate text-[10px] text-slate-500">
            {roleLabel}
            {clientName ? ` · ${clientName}` : ""}
          </p>
          <button type="button" onClick={logout} className="mt-2 w-full rounded-lg border border-white/10 py-1.5 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-100">
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  );
}
