"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_KEYS, FEATURE_LABELS, PLAN_PRESETS, type FeatureKey } from "@/lib/constants";

type ClientData = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  expiresAt: string;
  maxProjects: number;
  maxUsers: number;
  features: string[];
  projectCount: number;
  userCount: number;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  slogan: string | null;
  headerText: string | null;
  footerText: string | null;
  contactEmail: string | null;
  businessNo: string | null;
};

type UserRow = { id: string; email: string; name: string; role: string; clientId: string | null; clientName: string | null; createdAt: string };

export default function ClientAdmin({
  client,
  users,
  isAdmin,
  canManageUsers,
}: {
  client: ClientData;
  users: UserRow[];
  isAdmin: boolean;
  canManageUsers: boolean;
}) {
  const router = useRouter();
  const [brand, setBrand] = useState({
    name: client.name,
    primaryColor: client.primaryColor,
    accentColor: client.accentColor,
    slogan: client.slogan ?? "",
    headerText: client.headerText ?? "",
    footerText: client.footerText ?? "",
  });
  const [license, setLicense] = useState({
    plan: client.plan,
    expiresAt: client.expiresAt.slice(0, 10),
    maxProjects: client.maxProjects,
    maxUsers: client.maxUsers,
    features: client.features,
    contactEmail: client.contactEmail ?? "",
    businessNo: client.businessNo ?? "",
  });
  const [logoUrl, setLogoUrl] = useState(client.logoUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "USER" });

  const saveBrand = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...brand, ...(isAdmin ? { name: brand.name } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setMessage("화이트라벨 설정을 저장했습니다. 쇼룸 헤더·공유 페이지에 즉시 반영됩니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/clients/${client.id}/logo`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      setLogoUrl(data.logoUrl ?? null);
      setMessage("로고를 업로드했습니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const saveLicense = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(license),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setMessage("라이선스를 저장했습니다. 프로젝트·사용자 한도와 기능이 실시간으로 적용됩니다.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const addUser = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newUser, clientId: client.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "사용자 생성 실패");
      setMessage(`${newUser.email} 계정을 추가했습니다.`);
      setNewUser({ name: "", email: "", password: "", role: "USER" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사용자 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const toggleFeature = (feature: FeatureKey) => {
    setLicense((prev) => ({
      ...prev,
      features: prev.features.includes(feature) ? prev.features.filter((f) => f !== feature) : [...prev.features, feature],
    }));
  };

  return (
    <div className="space-y-4">
      {message ? <div className="rounded-xl border border-teal-300/30 bg-teal-400/10 px-4 py-2.5 text-xs text-teal-100">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-xs text-rose-200">{error}</div> : null}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black">화이트라벨 · 브랜딩</h2>
            <p className="text-[11px] text-slate-500">고객사 쇼룸 헤더·푸터·공유 페이지에 적용됩니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="mono rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400">코드: {client.slug}</span>
            <label className="btn btn-ghost btn-sm cursor-pointer">
              로고 업로드
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
            </label>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">고객사명</label>
            <input className="input" value={brand.name} disabled={!isAdmin} onChange={(e) => setBrand({ ...brand, name: e.target.value })} />
          </div>
          <div>
            <label className="label">슬로건</label>
            <input className="input" value={brand.slogan} onChange={(e) => setBrand({ ...brand, slogan: e.target.value })} />
          </div>
          <div>
            <label className="label">헤더 텍스트</label>
            <input className="input" value={brand.headerText} onChange={(e) => setBrand({ ...brand, headerText: e.target.value })} />
          </div>
          <div>
            <label className="label">푸터 텍스트</label>
            <input className="input" value={brand.footerText} onChange={(e) => setBrand({ ...brand, footerText: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <div>
              <label className="label">포인트 컬러</label>
              <input type="color" className="h-10 w-16" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
            </div>
            <div>
              <label className="label">보조 컬러</label>
              <input type="color" className="h-10 w-16" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} />
            </div>
          </div>
          <div className="flex items-end gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-10 max-w-[140px] rounded-lg bg-white/5 p-1 object-contain" />
            ) : (
              <span className="text-[10px] text-slate-500">등록된 로고 없음</span>
            )}
            <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={saveBrand} disabled={busy}>
              브랜딩 저장
            </button>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black">고객사 라이선스</h2>
              <p className="text-[11px] text-slate-500">플랜·만료일·프로젝트/사용자 한도·허용 기능을 관리합니다.</p>
            </div>
            <div className="flex gap-1">
              <span className={`badge ${new Date(client.expiresAt) < new Date() ? "badge-danger" : "badge-accent"}`}>
                {new Date(client.expiresAt) < new Date() ? "만료" : "사용 중"}
              </span>
              <span className="badge">프로젝트 {client.projectCount}/{client.maxProjects}</span>
              <span className="badge">사용자 {client.userCount}/{client.maxUsers}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">플랜</label>
              <select
                className="input"
                value={license.plan}
                onChange={(e) => {
                  const plan = e.target.value;
                  const preset = PLAN_PRESETS[plan];
                  setLicense({ ...license, plan, maxProjects: preset.maxProjects, maxUsers: preset.maxUsers, features: preset.features });
                }}
              >
                {Object.entries(PLAN_PRESETS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">만료일</label>
              <input type="date" className="input" value={license.expiresAt} onChange={(e) => setLicense({ ...license, expiresAt: e.target.value })} />
            </div>
            <div>
              <label className="label">담당 이메일</label>
              <input className="input" value={license.contactEmail} onChange={(e) => setLicense({ ...license, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="label">최대 프로젝트</label>
              <input type="number" className="input" value={license.maxProjects} onChange={(e) => setLicense({ ...license, maxProjects: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">최대 사용자</label>
              <input type="number" className="input" value={license.maxUsers} onChange={(e) => setLicense({ ...license, maxUsers: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">사업자번호</label>
              <input className="input" value={license.businessNo} onChange={(e) => setLicense({ ...license, businessNo: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <p className="label">허용 기능</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_KEYS.map((feature) => (
                <label key={feature} className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-300">
                  <input type="checkbox" checked={license.features.includes(feature)} onChange={() => toggleFeature(feature)} />
                  {FEATURE_LABELS[feature]}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn btn-primary btn-sm" onClick={saveLicense} disabled={busy}>
              라이선스 저장
            </button>
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black">사용자 관리</h2>
            <p className="text-[11px] text-slate-500">
              {client.userCount} / {client.maxUsers}명 사용 중 · 역할: 시스템 관리자 / 고객사 관리자 / 사용자
            </p>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2">이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>가입일</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-white/5">
                  <td className="py-2 text-slate-200">{user.name}</td>
                  <td className="mono text-slate-400">{user.email}</td>
                  <td>
                    <span className="badge">{user.role === "ADMIN" ? "시스템 관리자" : user.role === "CLIENT_ADMIN" ? "고객사 관리자" : "사용자"}</span>
                  </td>
                  <td className="text-slate-500">{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManageUsers ? (
          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <input className="input !py-1.5 !text-[11px]" placeholder="이름" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input className="input !py-1.5 !text-[11px]" placeholder="이메일" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className="input !py-1.5 !text-[11px]" placeholder="초기 비밀번호" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select className="input !py-1.5 !text-[11px]" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="USER">사용자</option>
              {isAdmin ? <option value="CLIENT_ADMIN">고객사 관리자</option> : null}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={addUser} disabled={busy}>
              추가
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
