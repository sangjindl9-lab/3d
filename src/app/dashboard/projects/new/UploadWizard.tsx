"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { INDUSTRIES, TEMPLATES } from "@/lib/constants";

type UploadInfo = {
  id: string;
  name: string;
  sizeLabel: string;
  formatId: string;
  formatLabel: string;
  kind: string;
  integrity: string;
  issues: string[];
  converter: string;
};

type Stage = { step: number; key: string; label: string; status: string; detail: string | null };

const STEPS = [
  { step: 1, label: "파일 업로드" },
  { step: 2, label: "형식 및 무결성 검사" },
  { step: 3, label: "2D/3D 자동 판별" },
  { step: 4, label: "부품 구조·계층 분석" },
  { step: 5, label: "모델 변환" },
  { step: 6, label: "웹 표시용 GLB 생성" },
  { step: 7, label: "메시 최적화" },
  { step: 8, label: "썸네일 생성" },
  { step: 9, label: "쇼룸 프로젝트 저장" },
  { step: 10, label: "3D 뷰어 자동 실행" },
];

const ACCEPT = ".dwg,.dxf,.pdf,.jpg,.jpeg,.png,.tif,.tiff,.step,.stp,.igs,.iges,.stl,.obj,.fbx,.glb,.gltf,.3mf,.ifc,.sldprt,.sldasm,.ipt,.iam,.catpart,.catproduct,.prt,.asm,.skp";

type ClientOption = { id: string; name: string; plan: string };

export default function UploadWizard({ clients = [] }: { clients?: ClientOption[] }) {
  const [phase, setPhase] = useState<"info" | "upload" | "process" | "done">("info");
  const [form, setForm] = useState({ title: "", industry: "MOLD", description: "", template: "MOLD_TECH", clientId: clients[0]?.id ?? "" });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadInfo[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ status: string; projectId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const industry = INDUSTRIES.find((i) => i.key === form.industry);
    if (industry) setForm((prev) => ({ ...prev, template: industry.defaultTemplate }));
  }, [form.industry]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length) setFiles((prev) => [...prev, ...dropped].slice(0, 8));
  }, []);

  const createProject = async () => {
    if (!form.title.trim()) {
      setError("프로젝트 이름을 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description, industry: form.industry, template: form.template, clientId: form.clientId || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { project?: { id: string }; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error ?? "프로젝트를 만들지 못했습니다.");
      setProjectId(data.project.id);
      setPhase("upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "프로젝트 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = (file: File): Promise<UploadInfo> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/projects/${projectId}/upload`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress((prev) => ({ ...prev, [file.name]: Math.round((event.loaded / event.total) * 100) }));
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}") as { upload?: UploadInfo; error?: string };
          if (xhr.status >= 200 && xhr.status < 300 && data.upload) {
            setProgress((prev) => ({ ...prev, [file.name]: 100 }));
            resolve(data.upload);
          } else {
            reject(new Error(data.error ?? "업로드 실패"));
          }
        } catch {
          reject(new Error("업로드 응답을 해석하지 못했습니다."));
        }
      };
      xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });

  const startConversion = async () => {
    if (!projectId) return;
    setUploading(true);
    setError(null);
    try {
      const results: UploadInfo[] = [];
      for (const file of files) {
        const info = await uploadFile(file);
        results.push(info);
        setUploads([...results]);
      }
      setPhase("process");
      setStages(STEPS.map((s) => ({ ...s, key: String(s.step), status: "PENDING", detail: null })));
      // 파이프라인 실행(진행 상황은 폴링으로 확인)
      void fetch(`/api/projects/${projectId}/process`, { method: "POST" }).catch(() => null);
      const started = Date.now();
      pollRef.current = window.setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/pipeline`, { cache: "no-store" });
          const data = (await res.json()) as { status: string; run?: { status: string; stages: Stage[] } };
          if (data.run?.stages?.length) setStages(data.run.stages);
          if (data.status !== "PROCESSING" || data.run?.status === "OK" || data.run?.status === "WARN" || data.run?.status === "FAILED" || Date.now() - started > 90000) {
            if (pollRef.current) window.clearInterval(pollRef.current);
            setDone({ status: data.status, projectId });
            setPhase("done");
          }
        } catch {
          /* keep polling */
        }
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
      if (pollRef.current) window.clearInterval(pollRef.current);
    } finally {
      setUploading(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === "OK") return "text-teal-300";
    if (status === "WARN") return "text-amber-300";
    if (status === "FAILED") return "text-rose-300";
    if (status === "RUNNING") return "text-sky-300";
    return "text-slate-600";
  };

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 md:px-8">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-200">
          대시보드
        </Link>
        <span>/</span>
        <span className="text-slate-300">새 3D 쇼룸</span>
      </div>
      <h1 className="mt-2 text-2xl font-black tracking-tight">새 3D 쇼룸 만들기</h1>
      <p className="mt-1 text-xs text-slate-500">
        CAD·도면을 올리면 10단계 파이프라인이 형식 검사 → 부품 분석 → GLB 변환 → 최적화 → 쇼룸 생성까지 자동 처리합니다.
      </p>

      <div className="mt-6 flex items-center gap-2">
        {[
          ["1", "프로젝트 정보"],
          ["2", "파일 업로드"],
          ["3", "자동 변환"],
          ["4", "쇼룸 열기"],
        ].map(([num, label], i) => {
          const active = ["info", "upload", "process", "done"].indexOf(phase) >= i;
          return (
            <div key={num} className="flex items-center gap-2">
              <div className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${active ? "bg-teal-400 text-[#04211d]" : "bg-white/10 text-slate-500"}`}>{num}</div>
              <span className={`text-[11px] ${active ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
              {i < 3 ? <span className="h-px w-6 bg-white/10" /> : null}
            </div>
          );
        })}
      </div>

      {error ? <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-xs text-rose-200">{error}</div> : null}

      {phase === "info" ? (
        <div className="card mt-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">프로젝트 이름 *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 2플레이트 사출금형 — 2026 신형" />
            </div>
            <div>
              <label className="label">산업군</label>
              <select className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
                {INDUSTRIES.map((industry) => (
                  <option key={industry.key} value={industry.key}>
                    {industry.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">{INDUSTRIES.find((i) => i.key === form.industry)?.summary}</p>
            </div>
            <div>
              <label className="label">쇼룸 템플릿</label>
              <select className="input" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.tagline}
                  </option>
                ))}
              </select>
            </div>
            {clients.length > 0 ? (
              <div className="md:col-span-2">
                <label className="label">소속 고객사 (관리자 배정)</label>
                <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} · {client.plan}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <label className="label">설명</label>
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="고객에게 보여줄 제품 설명, 주요 사양, 활용 목적" />
            </div>
          </div>
          <button type="button" className="btn btn-primary mt-4" onClick={createProject} disabled={busy}>
            {busy ? "생성 중…" : "다음 · 파일 업로드"}
          </button>
        </div>
      ) : null}

      {phase === "upload" ? (
        <div className="mt-4 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`card grid place-items-center border-2 border-dashed p-10 text-center transition ${dragging ? "border-teal-300/70 bg-teal-400/5" : "border-white/15"}`}
          >
            <div className="text-4xl text-slate-600">⬆</div>
            <p className="mt-3 text-sm font-bold">CAD · 도면 파일을 드래그하거나 클릭하세요</p>
            <p className="mt-1 text-[11px] text-slate-500">DWG · DXF · PDF · JPG · PNG · TIFF · STEP · IGES · STL · OBJ · FBX · GLB · 3MF · IFC (최대 8개, 80MB/파일)</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length) setFiles((prev) => [...prev, ...list].slice(0, 8));
              }}
            />
            <button type="button" className="btn btn-ghost mt-4" onClick={() => fileRef.current?.click()}>
              파일 선택
            </button>
          </div>

          {files.length > 0 ? (
            <div className="card divide-y divide-white/5">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="mono rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{file.name.split(".").pop()?.toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-slate-200">{file.name}</p>
                    <p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    {progress[file.name] !== undefined ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-teal-400 transition-all" style={{ width: `${progress[file.name]}%` }} />
                      </div>
                    ) : null}
                  </div>
                  {progress[file.name] === 100 ? <span className="text-[10px] text-teal-300">완료</span> : null}
                  <button type="button" className="text-[11px] text-slate-500 hover:text-rose-300" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>
                    제거
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold text-slate-300">샘플로 먼저 체험해 보세요</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                {[
                  ["sample-plate.dxf", "2D 도면(DXF)"],
                  ["sample-bracket.stl", "3D 메시(STL)"],
                  ["sample-housing.obj", "3D 그룹(OBJ)"],
                ].map(([file, label]) => (
                  <a key={file} href={`/api/files/samples/${file}`} download className="rounded-lg border border-white/10 px-2.5 py-1.5 text-slate-400 hover:bg-white/5">
                    ⬇ {label}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setPhase("info")}>
              이전
            </button>
            <button type="button" className="btn btn-primary flex-1" disabled={files.length === 0 || uploading} onClick={startConversion}>
              {uploading ? "업로드 중…" : `${files.length}개 파일 업로드 · 자동 변환 시작`}
            </button>
          </div>

          {uploads.length > 0 ? (
            <div className="card p-4">
              <p className="text-[11px] font-bold text-slate-300">파일 자동 분석 결과</p>
              <div className="mt-2 space-y-1.5">
                {uploads.map((upload) => (
                  <div key={upload.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px]">
                    <span className="truncate text-slate-300">{upload.name}</span>
                    <span className="flex-none text-slate-500">
                      {upload.formatLabel} · {upload.kind === "2D" ? "2D 도면" : "3D 모델"} · {upload.sizeLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "process" || phase === "done" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="card p-5">
            <p className="text-[12px] font-bold">자동 변환 파이프라인</p>
            <p className="mt-0.5 text-[10px] text-slate-500">10단계 상태가 실시간으로 기록됩니다.</p>
            <div className="mt-4 space-y-1.5">
              {STEPS.map((step) => {
                const stage = stages.find((s) => s.step === step.step);
                const status = stage?.status ?? "PENDING";
                return (
                  <div key={step.step} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
                    <span className={`mono mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[9px] ${status === "OK" ? "bg-teal-400/20 text-teal-300" : status === "WARN" ? "bg-amber-400/20 text-amber-300" : status === "FAILED" ? "bg-rose-400/20 text-rose-300" : status === "RUNNING" ? "bg-sky-400/20 text-sky-300" : "bg-white/5 text-slate-600"}`}>
                      {status === "OK" ? "✓" : status === "FAILED" ? "!" : step.step}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-[11px] font-semibold ${status === "PENDING" ? "text-slate-500" : "text-slate-200"}`}>{step.label}</p>
                      {stage?.detail ? <p className={`mt-0.5 break-words text-[10px] leading-relaxed ${statusColor(status)}`}>{stage.detail}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card p-5">
            {phase === "process" ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300" />
                <p className="mt-3 text-xs font-semibold text-slate-300">변환 중입니다…</p>
                <p className="mt-1 text-[10px] text-slate-500">파일 크기에 따라 수십 초가 걸릴 수 있습니다.</p>
              </div>
            ) : (
              <div>
                <p className="text-[12px] font-bold">
                  {done?.status === "READY" ? "쇼룸이 준비되었습니다" : done?.status === "CONVERT_REQUIRED" ? "추가 변환이 필요합니다" : "확인이 필요합니다"}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {done?.status === "READY"
                    ? "3D 뷰어에서 부품 정보·분해도·애니메이션·공유 링크를 사용할 수 있습니다."
                    : done?.status === "CONVERT_REQUIRED"
                      ? "이 형식은 외부 CAD 변환기가 필요합니다. STEP/GLB/STL/OBJ 로 변환해 다시 업로드해 주세요."
                      : "일부 단계에서 경고가 발생했습니다. 상세 내용은 파이프라인 로그를 확인하세요."}
                </p>
                <div className="mt-4 space-y-2">
                  <Link href={`/dashboard/projects/${done?.projectId ?? projectId}`} className="btn btn-primary w-full">
                    3D 쇼룸 열기
                  </Link>
                  <Link href="/dashboard" className="btn btn-ghost w-full">
                    대시보드로
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
