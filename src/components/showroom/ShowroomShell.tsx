"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShowroomEngine, type EngineAnnotation, type EnginePart } from "./engine";
import type { ShowroomPayload } from "@/lib/showroom-data";
import { BACKGROUNDS, TEMPLATES, industryLabel, materialPreset, templateByKey, type FeatureKey } from "@/lib/constants";

type Props = {
  payload: ShowroomPayload;
  mode: "editor" | "share";
  homeHref?: string;
};

type Tab = "info" | "explode" | "anim" | "note" | "export" | "share" | "ai";

async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data?.error ?? "요청을 처리하지 못했습니다.");
  return data;
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Btn({
  active,
  children,
  onClick,
  title,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
        active
          ? "border-teal-300/60 bg-teal-400/20 text-teal-100"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export default function ShowroomShell({ payload, mode, homeHref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShowroomEngine | null>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parts, setParts] = useState<EnginePart[]>(payload.parts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(payload.project.isAiReference ? "ai" : "info");
  const [explode, setExplode] = useState(0);
  const [xray, setXray] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [labels, setLabels] = useState<"none" | "name" | "number">("none");
  const [projection, setProjection] = useState<"perspective" | "orthographic">("perspective");
  const [autoRotate, setAutoRotate] = useState(false);
  const [templateKey, setTemplateKey] = useState(payload.project.template);
  const [background, setBackground] = useState(payload.project.background);
  const [dragMode, setDragMode] = useState(false);
  const [clip, setClip] = useState<{ x: number | null; y: number | null; z: number | null }>({ x: null, y: null, z: null });
  const [search, setSearch] = useState("");
  const [annotations, setAnnotations] = useState<EngineAnnotation[]>(payload.annotations);
  const annotationsRef = useRef<EngineAnnotation[]>(payload.annotations);
  const [annotationDraft, setAnnotationDraft] = useState<{ position: [number, number, number]; title: string; body: string } | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<EngineAnnotation | null>(null);
  const [sequences] = useState(payload.sequences);
  const [presets, setPresets] = useState(payload.presets);
  const [activeSequenceId, setActiveSequenceId] = useState<string | null>(payload.sequences[0]?.id ?? null);
  const [seqState, setSeqState] = useState<{ playing: boolean; stepIndex: number; progress: number; time: number; duration: number } | null>(null);
  const [seqSpeed, setSeqSpeed] = useState(1);
  const [recording, setRecording] = useState(false);
  const [snapshotTransparent, setSnapshotTransparent] = useState(false);
  const [snapshotSize, setSnapshotSize] = useState<"1920" | "2560" | "3840">("1920");
  const [videoDuration, setVideoDuration] = useState(8);
  const [share, setShare] = useState(payload.share);
  const [shareForm, setShareForm] = useState({ password: "", days: "0" });
  const [shareBusy, setShareBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<"parts" | "tools" | null>(null);
  const [infoDraft, setInfoDraft] = useState<Partial<EnginePart>>({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [aiUploading, setAiUploading] = useState(false);

  const theme = useMemo(() => templateByKey(templateKey), [templateKey]);
  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const features = payload.features;
  const hasFeature = useCallback((f: FeatureKey) => features.includes(f), [features]);
  const editable = mode === "editor" && payload.canEdit;
  const shareUrl = share ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${share.slug}` : "";

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshParts = useCallback(async () => {
    if (mode !== "editor") return;
    try {
      const res = await fetch(`/api/projects/${payload.project.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { parts: EnginePart[] };
      setParts(data.parts);
    } catch {
      /* ignore */
    }
  }, [mode, payload.project.id]);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new ShowroomEngine({
      container: containerRef.current,
      modelUrl: payload.project.modelUrl,
      parts: payload.parts,
      annotations: payload.annotations,
      theme: { ...theme },
      background: payload.project.background,
      referenceImageUrl: payload.project.referenceImageUrl,
      editable,
      onSelect: (id) => {
        setSelectedId(id);
        if (id) setTab((prev) => (prev === "note" || prev === "export" || prev === "share" ? prev : "info"));
      },
      onLoaded: () => setReady(true),
      onError: (message) => setLoadError(message),
      onAnnotationActivate: (id) => {
        const hit = annotationsRef.current.find((a) => a.id === id) ?? null;
        setActiveAnnotation(hit);
      },
      onAnnotationCreate: (position) => {
        if (!editable) return;
        setAnnotationDraft({ position, title: "", body: "" });
        setTab("note");
      },
      onPartMoved: (partId, exploded, distance) => {
        void api(`/api/parts/${partId}`, "PATCH", { exploded, explodedDistance: distance })
          .then(() => refreshParts())
          .catch(() => null);
      },
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.project.id]);

  useEffect(() => {
    if (!selected) {
      setInfoDraft({});
      return;
    }
    setInfoDraft({
      name: selected.name,
      description: selected.description ?? "",
      material: selected.material,
      spec: selected.spec ?? "",
      weight: selected.weight ?? 0,
      quantity: selected.quantity,
    });
  }, [selected]);

  const applyTheme = useCallback(
    (nextTemplate: string, nextBackground: string) => {
      const t = templateByKey(nextTemplate);
      engineRef.current?.setTheme({ ...t }, nextBackground);
    },
    [],
  );

  const onTemplate = (key: string) => {
    setTemplateKey(key);
    applyTheme(key, background);
    if (mode === "editor" && editable) {
      void api(`/api/projects/${payload.project.id}`, "PATCH", { template: key }).catch(() => null);
    }
  };

  const onBackground = (key: string) => {
    setBackground(key);
    engineRef.current?.setBackground(key, templateByKey(templateKey));
    if (mode === "editor" && editable) {
      void api(`/api/projects/${payload.project.id}`, "PATCH", { background: key }).catch(() => null);
    }
  };

  const toggleHide = (part: EnginePart) => {
    const next = !part.visible;
    engineRef.current?.setVisible(part.id, next);
    setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, visible: next } : p)));
    if (editable) void api(`/api/parts/${part.id}`, "PATCH", { visible: next }).catch(() => null);
  };

  const isolate = (part: EnginePart) => {
    engineRef.current?.isolate(part.id);
    setParts((prev) => prev.map((p) => ({ ...p, visible: p.id === part.id })));
  };

  const showAll = () => {
    engineRef.current?.isolate(null);
    setParts((prev) => prev.map((p) => ({ ...p, visible: true })));
  };

  const applyOpacity = (part: EnginePart, value: number) => {
    engineRef.current?.setPartOpacity(part.id, value);
    setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, opacity: value } : p)));
  };

  const saveInfo = async () => {
    if (!selected) return;
    setSavingInfo(true);
    try {
      await api(`/api/parts/${selected.id}`, "PATCH", {
        name: infoDraft.name,
        description: infoDraft.description,
        material: infoDraft.material,
        spec: infoDraft.spec,
        weight: Number(infoDraft.weight),
        quantity: Number(infoDraft.quantity),
      });
      setParts((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? {
                ...p,
                name: infoDraft.name ?? p.name,
                description: infoDraft.description ?? p.description,
                material: infoDraft.material ?? p.material,
                spec: infoDraft.spec ?? p.spec,
                weight: Number(infoDraft.weight ?? p.weight),
                quantity: Number(infoDraft.quantity ?? p.quantity),
              }
            : p,
        ),
      );
      showToast("부품 정보를 저장했습니다. (원본 파일은 수정되지 않습니다)");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSavingInfo(false);
    }
  };

  const savePreset = async () => {
    const name = window.prompt("카메라 프리셋 이름", `뷰 ${presets.length + 1}`);
    if (!name) return;
    const state = engineRef.current?.getCameraState();
    if (!state) return;
    try {
      const res = await api<{ preset: { id: string; name: string } }>(`/api/projects/${payload.project.id}/presets`, "POST", {
        name,
        position: state.position,
        target: state.target,
      });
      setPresets((prev) => [...prev, { id: res.preset.id, name: res.preset.name, position: state.position, target: state.target, isDefault: false }]);
      showToast("카메라 프리셋을 저장했습니다.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "프리셋 저장 실패");
    }
  };

  const removePreset = async (id: string) => {
    try {
      await api(`/api/presets/${id}`, "DELETE");
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "프리셋 삭제 실패");
    }
  };

  const sequenceAllowed = (kind: string) =>
    kind === "MOLD" ? hasFeature("MOLD_ANIM") : kind === "MACHINE" ? hasFeature("MACHINE_ANIM") : true;

  const selectedSequence = sequences.find((s) => s.id === activeSequenceId) ?? null;

  const loadSequence = (id: string) => {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    setActiveSequenceId(id);
    engineRef.current?.loadSequence(seq, (state) => setSeqState(state));
    setTab("anim");
  };

  const playSequence = () => {
    if (!selectedSequence) return;
    if (!seqState || seqState.duration === 0) {
      engineRef.current?.loadSequence(selectedSequence, (state) => setSeqState(state));
    }
    engineRef.current?.playSequence();
  };

  const addAnnotation = async () => {
    if (!annotationDraft) return;
    if (!annotationDraft.title.trim()) {
      showToast("주석 제목을 입력하세요.");
      return;
    }
    try {
      const res = await api<{ annotation: EngineAnnotation }>(`/api/projects/${payload.project.id}/annotations`, "POST", {
        title: annotationDraft.title,
        body: annotationDraft.body,
        x: annotationDraft.position[0],
        y: annotationDraft.position[1],
        z: annotationDraft.position[2],
      });
      const next = [...annotations, res.annotation];
      setAnnotations(next);
      engineRef.current?.refreshAnnotations(next);
      setAnnotationDraft(null);
      showToast("3D 주석을 추가했습니다.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "주석 추가 실패");
    }
  };

  const removeAnnotation = async (id: string) => {
    if (!confirm("이 주석을 삭제할까요?")) return;
    try {
      await api(`/api/annotations/${id}`, "DELETE");
      const next = annotations.filter((a) => a.id !== id);
      setAnnotations(next);
      engineRef.current?.refreshAnnotations(next);
      setActiveAnnotation(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "삭제 실패");
    }
  };

  const takeSnapshot = () => {
    try {
      const data = engineRef.current?.captureImage({
        width: Number(snapshotSize),
        height: Math.round((Number(snapshotSize) * 9) / 16),
        transparent: snapshotTransparent,
        format: "png",
      });
      if (!data) return;
      downloadDataUrl(data, `${payload.project.title.replace(/\s+/g, "_")}_${snapshotSize}.png`);
      if (editable) {
        void api(`/api/projects/${payload.project.id}/thumbnail`, "PUT", { dataUrl: data }).catch(() => null);
      }
      showToast(`${snapshotSize}px PNG 스냅샷을 저장했습니다.`);
    } catch {
      showToast("스냅샷 생성에 실패했습니다.");
    }
  };

  const recordVideo = async () => {
    if (!hasFeature("VIDEO")) {
      showToast("현재 플랜에는 동영상 내보내기가 포함되어 있지 않습니다.");
      return;
    }
    setRecording(true);
    try {
      const result = await engineRef.current!.startRecording(videoDuration * 1000);
      downloadBlob(result.blob, `${payload.project.title.replace(/\s+/g, "_")}_360.${result.extension}`);
      showToast(
        result.extension === "mp4"
          ? "MP4 360° 영상을 저장했습니다."
          : "이 브라우저는 MP4 인코딩을 지원하지 않아 WebM 으로 저장했습니다. (표준 MP4 는 서버 변환 단계에서 지원 예정)",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "녹화에 실패했습니다.");
    } finally {
      setRecording(false);
    }
  };

  const createShare = async (regenerate = false) => {
    setShareBusy(true);
    try {
      const res = await api<{ slug: string; hasPassword: boolean; expiresAt: string | null; viewCount: number; allowDownload: boolean }>(
        `/api/projects/${payload.project.id}/share`,
        "POST",
        { password: shareForm.password || null, days: Number(shareForm.days), regenerate },
      );
      setShare(res);
      showToast(regenerate ? "새 공유 링크를 발급했습니다. 기존 링크는 무효화됩니다." : "공유 링크를 발급했습니다.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "공유 링크 생성 실패");
    } finally {
      setShareBusy(false);
    }
  };

  const disableShare = async () => {
    if (!confirm("공유 링크를 비활성화할까요?")) return;
    try {
      await api(`/api/projects/${payload.project.id}/share`, "DELETE");
      setShare(null);
      showToast("공유를 중지했습니다.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "중지 실팼습니다.");
    }
  };

  const uploadAiModel = async (file: File) => {
    setAiUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${payload.project.id}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "업로드 실패");
      }
      await api(`/api/projects/${payload.project.id}/process`, "POST", {});
      showToast("3D 모델로 교체했습니다. 잠시 후 새로고침합니다.");
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "업로드 실패");
      setAiUploading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#05080f] text-slate-100">
      {/* Header */}
      <header className="z-20 flex flex-none items-center justify-between gap-3 border-b border-white/10 bg-[#060b13]/90 px-3 py-2 backdrop-blur md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {homeHref ? (
            <Link href={homeHref} className="flex items-center gap-2 text-sm font-black tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-300 to-sky-400 text-[13px] text-[#04121a]">E</span>
              <span className="hidden sm:inline">EUM 3D</span>
            </Link>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {payload.brand?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={payload.brand.logoUrl} alt={payload.brand.clientName} className="h-5 max-w-[90px] object-contain" />
              ) : (
                <span className="truncate text-[12px] font-semibold" style={{ color: payload.brand?.primaryColor ?? "#5eead4" }}>
                  {payload.brand?.clientName ?? "EUM 3D SHOWROOM PRO"}
                </span>
              )}
              {mode === "share" ? <span className="badge">읽기 전용 공유</span> : null}
              {payload.project.isAiReference ? <span className="badge badge-warn">참고용 AI 3D</span> : null}
            </div>
            <h1 className="truncate text-[13px] font-bold text-slate-100">{payload.project.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-500 md:inline">
            {industryLabel(payload.project.industry)} · {payload.parts.length}개 부품
          </span>
          {mode === "editor" ? (
            <Link href="/dashboard" className="btn btn-ghost btn-sm">
              대시보드
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPanelOpen(panelOpen === "parts" ? null : "parts")}
          >
            부품
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setPanelOpen(panelOpen === "tools" ? null : "tools")}
          >
            도구
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Left: parts */}
        <aside
          className={`absolute inset-y-0 left-0 z-30 w-[300px] flex-none border-r border-white/10 bg-[#070c14]/95 backdrop-blur transition-transform md:static md:z-0 md:bg-[#070c14]/70 ${
            panelOpen === "parts" ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          } flex flex-col`}
        >
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-[12px] font-bold tracking-wide text-slate-300">부품 트리 · {parts.length}</h2>
            <button type="button" className="text-[11px] text-slate-500 hover:text-slate-200 md:hidden" onClick={() => setPanelOpen(null)}>
              닫기
            </button>
          </div>
          <div className="px-4 py-3">
            <input className="input !py-1.5 !text-[12px]" placeholder="부품 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {parts
              .filter((p) => !search || p.name.includes(search) || (p.partNumber ?? "").includes(search))
              .map((part) => {
                const preset = materialPreset(part.material);
                return (
                  <div
                    key={part.id}
                    className={`group mb-1 rounded-lg border px-2 py-2 transition ${
                      selectedId === part.id ? "border-teal-400/50 bg-teal-400/10" : "border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => engineRef.current?.select(part.id)}>
                      <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: part.color || preset.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-slate-200">{part.name}</span>
                        <span className="mono block text-[10px] text-slate-500">
                          {part.partNumber} · {part.material}
                        </span>
                      </span>
                    </button>
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleHide(part)}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${part.visible ? "text-slate-400 hover:text-white" : "text-amber-300"}`}
                        title="표시/숨김"
                      >
                        {part.visible ? "숨김" : "표시"}
                      </button>
                      <button type="button" onClick={() => isolate(part)} className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white" title="격리">
                        격리
                      </button>
                      <span className="ml-auto text-[10px] text-slate-600">{part.weight ? `${part.weight}kg` : ""}</span>
                    </div>
                  </div>
                );
              })}
            <button type="button" onClick={showAll} className="mt-2 w-full rounded-lg border border-white/10 py-1.5 text-[11px] text-slate-400 hover:bg-white/5">
              전체 표시 · 격리 해제
            </button>
          </div>
          <div className="border-t border-white/10 px-3 py-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold text-slate-400">카메라 프리셋</span>
              <button type="button" onClick={savePreset} className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-teal-200 hover:bg-teal-400/10">
                + 현재 뷰
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {presets.map((preset) => (
                <span key={preset.id} className="group inline-flex items-center overflow-hidden rounded-md border border-white/10">
                  <button type="button" onClick={() => engineRef.current?.setCameraState({ position: preset.position, target: preset.target })} className="px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-white/5">
                    {preset.name}
                  </button>
                  {editable ? (
                    <button type="button" onClick={() => removePreset(preset.id)} className="border-l border-white/10 px-1 py-0.5 text-[9px] text-slate-600 hover:text-rose-300" title="프리셋 삭제">
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {presets.length === 0 ? <span className="px-1 text-[9px] text-slate-600">저장된 프리셋이 없습니다.</span> : null}
            </div>
          </div>
          <div className="border-t border-white/10 px-4 py-2 text-[10px] leading-relaxed text-slate-500">
            좌클릭 드래그 회전 · 우클릭 이동 · 휠 확대 · 부품 클릭 선택
          </div>
        </aside>

        {/* Center viewer */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <div ref={containerRef} className="absolute inset-0" />
            {!ready && !loadError ? (
              <div className="absolute inset-0 grid place-items-center bg-[#060b13]/60">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-teal-300/30 border-t-teal-300" />
                  <span className="text-xs">3D 쇼룸을 준비하는 중…</span>
                </div>
              </div>
            ) : null}
            {loadError ? (
              <div className="absolute inset-0 grid place-items-center p-6">
                <div className="card max-w-md p-6 text-center">
                  <p className="text-sm font-bold text-rose-300">3D 모델을 불러오지 못했습니다</p>
                  <p className="mt-2 text-xs text-slate-400">{loadError}</p>
                </div>
              </div>
            ) : null}
            {payload.project.isAiReference ? (
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200 backdrop-blur">
                참고용 AI 3D 시각화 · 설계/치수 확정용 아님
                {payload.project.aiMode === "HEURISTIC_RULES" ? <span className="ml-1 font-normal text-amber-200/70">(규칙 기반 분석)</span> : null}
              </div>
            ) : null}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-[#060b13]/85 px-2 py-1.5 backdrop-blur">
              {(["front", "back", "left", "right", "top", "bottom"] as const).map((v) => (
                <Btn key={v} onClick={() => engineRef.current?.view(v)} title={`${v} 보기`}>
                  {{ front: "정면", back: "후면", left: "좌측", right: "우측", top: "상부", bottom: "하부" }[v]}
                </Btn>
              ))}
              <span className="mx-1 h-4 w-px bg-white/10" />
              <Btn onClick={() => engineRef.current?.frameModel(false)} title="전체 보기">
                Fit
              </Btn>
              <Btn active={projection === "orthographic"} onClick={() => { const next = projection === "perspective" ? "orthographic" : "perspective"; setProjection(next); engineRef.current?.setProjection(next); }}>
                {projection === "perspective" ? "원근" : "직교"}
              </Btn>
              <Btn active={autoRotate} onClick={() => { const next = !autoRotate; setAutoRotate(next); engineRef.current?.setAutoRotate(next, 1.4); }}>
                자동회전
              </Btn>
              <Btn onClick={() => engineRef.current?.fullscreen()}>전체화면</Btn>
            </div>
            <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#060b13]/85 p-1 backdrop-blur">
                <Btn active={xray} disabled={!hasFeature("XRAY")} onClick={() => { const next = !xray; setXray(next); engineRef.current?.setXray(next); }}>
                  X-Ray
                </Btn>
                <Btn active={wireframe} onClick={() => { const next = !wireframe; setWireframe(next); engineRef.current?.setWireframe(next); }}>
                  와이어
                </Btn>
                <Btn active={labels !== "none"} onClick={() => { const next = labels === "none" ? "name" : labels === "name" ? "number" : "none"; setLabels(next); engineRef.current?.setLabels(next); }}>
                  라벨
                </Btn>
              </div>
              <select
                value={background}
                onChange={(e) => onBackground(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#060b13]/85 px-2 py-1 text-[11px] text-slate-300 backdrop-blur"
              >
                {BACKGROUNDS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
              <select
                value={templateKey}
                onChange={(e) => onTemplate(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#060b13]/85 px-2 py-1 text-[11px] text-slate-300 backdrop-blur"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Explode quick slider */}
            <div className="absolute bottom-16 left-1/2 w-[min(720px,90%)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#060b13]/85 px-4 py-2 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-slate-300">분해도</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(explode * 100)}
                  disabled={!hasFeature("EXPLODE")}
                  onChange={(e) => {
                    const value = Number(e.target.value) / 100;
                    setExplode(value);
                    engineRef.current?.setExplode(value);
                  }}
                  className="h-1 flex-1"
                />
                <span className="mono w-9 text-right text-[11px] text-teal-200">{Math.round(explode * 100)}%</span>
                <button
                  type="button"
                  onClick={() => {
                    setExplode(0);
                    engineRef.current?.setExplode(0);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-200"
                >
                  초기화
                </button>
              </div>
              {["x", "y", "z"].map((axis) => (
                <div key={axis} className="mt-1.5 flex items-center gap-2">
                  <span className="mono w-4 text-[10px] uppercase text-slate-500">{axis}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((clip[axis as "x" | "y" | "z"] ?? 1) * 100)}
                    onChange={(e) => {
                      const value = Number(e.target.value) / 100;
                      const next = { ...clip, [axis]: value >= 0.999 ? null : value };
                      setClip(next);
                      engineRef.current?.setClipping(axis as "x" | "y" | "z", value >= 0.999 ? null : value);
                    }}
                    className="h-1 flex-1"
                    title="단면 보기"
                  />
                  <span className="mono w-9 text-right text-[10px] text-slate-500">단면</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right tools */}
        <aside
          className={`absolute inset-y-0 right-0 z-30 flex w-[330px] flex-none flex-col border-l border-white/10 bg-[#070c14]/95 backdrop-blur transition-transform md:static md:z-0 md:bg-[#070c14]/70 ${
            panelOpen === "tools" ? "translate-x-0" : "translate-x-full md:translate-x-0"
          }`}
        >
          <div className="flex items-center justify-between px-4 pt-4 md:hidden">
            <span className="text-[12px] font-bold text-slate-300">도구</span>
            <button type="button" className="text-[11px] text-slate-500" onClick={() => setPanelOpen(null)}>
              닫기
            </button>
          </div>
          <div className="hide-scrollbar flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
            {(
              [
                ["info", "부품"],
                ["explode", "분해"],
                ["anim", "애니"],
                ["note", "주석"],
                ["ai", "AI"],
                ["export", "내보내기"],
                ["share", "공유"],
              ] as [Tab, string][]
            )
              .filter(([key]) => (key === "share" ? mode === "editor" && editable : true))
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    tab === key ? "bg-teal-400/15 text-teal-100" : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[12px]">
            {tab === "info" ? (
              selected ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white">{selected.name}</h3>
                      <p className="mono text-[10px] text-slate-500">{selected.partNumber}</p>
                    </div>
                    <span className="badge">{materialPreset(selected.material).label}</span>
                  </div>
                  <dl className="space-y-1.5 text-[11px]">
                    {[
                      ["재질", materialPreset(selected.material).label],
                      ["규격", selected.spec ?? "-"],
                      ["중량", selected.weight != null ? `${selected.weight} kg` : "-"],
                      ["수량", `${selected.quantity} EA`],
                      ["부품번호", selected.partNumber ?? "-"],
                      ["크기(mm)", selected.size.map((v) => Math.round(v * 1000)).join(" × ")],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex justify-between gap-3 border-b border-white/5 pb-1">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="text-right text-slate-300">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="rounded-lg bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-slate-400">{selected.description}</p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>투명도</span>
                      <span className="mono">{Math.round(selected.opacity * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={Math.round(selected.opacity * 100)} onChange={(e) => applyOpacity(selected, Number(e.target.value) / 100)} className="w-full" />
                  </div>
                  {editable ? (
                    <details className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">부품 정보 편집</summary>
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="label">이름</label>
                          <input className="input !py-1 !text-[11px]" value={infoDraft.name ?? ""} onChange={(e) => setInfoDraft({ ...infoDraft, name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label">재질</label>
                            <select className="input !py-1 !text-[11px]" value={infoDraft.material} onChange={(e) => setInfoDraft({ ...infoDraft, material: e.target.value })}>
                              {["STEEL", "STAINLESS", "ALUMINUM", "BRASS", "PLASTIC", "GLASS", "PAINT", "COPPER"].map((m) => (
                                <option key={m} value={m}>
                                  {materialPreset(m).label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label">중량(kg)</label>
                            <input className="input !py-1 !text-[11px]" type="number" step="0.01" value={infoDraft.weight ?? 0} onChange={(e) => setInfoDraft({ ...infoDraft, weight: Number(e.target.value) })} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label">수량</label>
                            <input className="input !py-1 !text-[11px]" type="number" value={infoDraft.quantity ?? 1} onChange={(e) => setInfoDraft({ ...infoDraft, quantity: Number(e.target.value) })} />
                          </div>
                          <div>
                            <label className="label">규격</label>
                            <input className="input !py-1 !text-[11px]" value={infoDraft.spec ?? ""} onChange={(e) => setInfoDraft({ ...infoDraft, spec: e.target.value })} />
                          </div>
                        </div>
                        <div>
                          <label className="label">설명</label>
                          <textarea className="input !py-1 !text-[11px]" rows={3} value={infoDraft.description ?? ""} onChange={(e) => setInfoDraft({ ...infoDraft, description: e.target.value })} />
                        </div>
                        <button type="button" className="btn btn-primary btn-sm w-full" disabled={savingInfo} onClick={saveInfo}>
                          {savingInfo ? "저장 중…" : "부품 정보 저장"}
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-[11px] text-slate-500">
                  부품을 선택하면 재질·규격·중량·수량·부품번호가 표시됩니다.
                </div>
              )
            ) : null}

            {tab === "explode" ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>전체 분해도</span>
                    <span className="mono text-teal-200">{Math.round(explode * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={Math.round(explode * 100)} onChange={(e) => { const v = Number(e.target.value) / 100; setExplode(v); engineRef.current?.setExplode(v); }} className="w-full" />
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    분해 방향은 조립 중심에서 각 부품 중심으로 자동 계산됩니다. 아래에서 부품별로 방향·거리를 조정하거나 3D 상에서 직접 드래그할 수 있습니다.
                  </p>
                </div>
                {selected ? (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] font-bold text-slate-200">{selected.name}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["x", "y", "z"] as const).map((axis, i) => (
                        <div key={axis}>
                          <label className="label !mb-1 !text-[10px] uppercase">{axis}</label>
                          <input
                            type="number"
                            step="0.1"
                            disabled={!editable}
                            className="input !px-2 !py-1 !text-[11px]"
                            value={Number(selected.exploded[i].toFixed(2))}
                            onChange={(e) => {
                              const next = [...selected.exploded] as [number, number, number];
                              next[i] = Number(e.target.value);
                              setParts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, exploded: next } : p)));
                              engineRef.current?.setPartExplode(selected.id, next, selected.explodedDistance);
                              if (editable) void api(`/api/parts/${selected.id}`, "PATCH", { exploded: next }).catch(() => null);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                        <span>분해 거리</span>
                        <span className="mono">{selected.explodedDistance.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        disabled={!editable}
                        value={Math.round(selected.explodedDistance * 100)}
                        onChange={(e) => {
                          const value = Number(e.target.value) / 100;
                          setParts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, explodedDistance: value } : p)));
                          engineRef.current?.setPartExplode(selected.id, selected.exploded, value);
                          if (editable) void api(`/api/parts/${selected.id}`, "PATCH", { explodedDistance: value }).catch(() => null);
                        }}
                        className="w-full"
                      />
                    </div>
                    {editable ? (
                      <button
                        type="button"
                        className={`btn btn-sm w-full ${dragMode ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => {
                          const next = !dragMode;
                          if (next && explode < 0.05) {
                            setExplode(1);
                            engineRef.current?.setExplode(1);
                          }
                          setDragMode(next);
                          engineRef.current?.setDragMode(next, selected.id);
                        }}
                      >
                        {dragMode ? "3D 드래그 이동 종료" : "3D 드래그로 위치 편집"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">부품을 선택하면 개별 분해 방향을 편집할 수 있습니다.</p>
                )}
                <div className="rounded-lg border border-white/10 p-2.5 text-[10px] leading-relaxed text-slate-500">
                  분해도·이동은 쇼룸 장면에만 저장되며 원본 CAD 파일은 절대 수정되지 않습니다.
                </div>
              </div>
            ) : null}

            {tab === "anim" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {sequences.map((seq) => {
                    const allowed = sequenceAllowed(seq.kind);
                    return (
                      <button
                        key={seq.id}
                        type="button"
                        disabled={!allowed}
                        title={allowed ? undefined : "현재 플랜에 포함되지 않은 기능입니다."}
                        onClick={() => loadSequence(seq.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition disabled:opacity-40 ${
                          activeSequenceId === seq.id ? "border-teal-400/50 bg-teal-400/10" : "border-white/10 hover:bg-white/5"
                        }`}
                      >
                        <span className="text-[11px] font-semibold text-slate-200">{seq.name}</span>
                        <span className="badge !text-[9px]">{allowed ? seq.kind : "플랜 제한"}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedSequence ? (
                  <>
                    <div className="flex items-center gap-1">
                      <button type="button" className="btn btn-primary btn-sm flex-1" disabled={!sequenceAllowed(selectedSequence.kind)} onClick={() => (seqState?.playing ? engineRef.current?.pauseSequence() : playSequence())}>
                        {seqState?.playing ? "일시정지" : "재생"}
                      </button>
                      <Btn onClick={() => { engineRef.current?.stopSequence(); setSeqState((prev) => (prev ? { ...prev, playing: false, progress: 0, time: 0 } : prev)); }}>정지</Btn>
                      <select className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[10px]" value={seqSpeed} onChange={(e) => { const v = Number(e.target.value); setSeqSpeed(v); engineRef.current?.setSequenceSpeed(v); }}>
                        {[0.5, 1, 1.5, 2].map((s) => (
                          <option key={s} value={s}>
                            {s}x
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-sky-400 transition-[width]" style={{ width: `${Math.round((seqState?.progress ?? 0) * 100)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                        <span>{selectedSequence.steps[seqState?.stepIndex ?? 0]?.label ?? ""}</span>
                        <span className="mono">{((seqState?.time ?? 0) / 1000).toFixed(1)}s / {(selectedSequence.durationMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {selectedSequence.steps.map((step, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => engineRef.current?.seekStep(index)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] ${
                            seqState?.stepIndex === index ? "bg-teal-400/10 text-teal-100" : "text-slate-400 hover:bg-white/5"
                          }`}
                        >
                          <span className="mono w-4 text-slate-600">{index + 1}</span>
                          <span className="flex-1 truncate">{step.label}</span>
                          <span className="mono text-slate-600">{(step.durationMs / 1000).toFixed(1)}s</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      스텝을 누르면 해당 단계로 이동합니다. 금형 개폐·기계 작동 시퀀스는 부품 이동/회전으로 재생됩니다.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {tab === "note" ? (
              <div className="space-y-3">
                {editable ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-full"
                    onClick={() => {
                      engineRef.current?.setAnnotationMode(true);
                      showToast("3D 공간에서 주석을 붙일 위치를 클릭하세요.");
                    }}
                  >
                    + 3D 공간에 주석 추가
                  </button>
                ) : null}
                <label className="flex items-center gap-2 text-[11px] text-slate-400">
                  <input type="checkbox" defaultChecked onChange={(e) => engineRef.current?.setAnnotationsVisible(e.target.checked)} /> 주석 핀 표시
                </label>
                <div className="space-y-1.5">
                  {annotations.map((ann, i) => (
                    <button
                      key={ann.id}
                      type="button"
                      onClick={() => setActiveAnnotation(ann)}
                      className="flex w-full items-start gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-left hover:bg-white/5"
                    >
                      <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-teal-400/90 text-[10px] font-bold text-[#04211d]">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-slate-200">{ann.title}</span>
                        <span className="line-clamp-2 block text-[10px] text-slate-500">{ann.body}</span>
                      </span>
                    </button>
                  ))}
                  {annotations.length === 0 ? <p className="text-[11px] text-slate-500">등록된 주석이 없습니다.</p> : null}
                </div>
              </div>
            ) : null}

            {tab === "ai" ? (
              <div className="space-y-3">
                {payload.project.isAiReference ? (
                  <>
                    <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 p-3">
                      <p className="text-[11px] font-bold text-amber-200">참고용 AI 3D 시각화</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-amber-100/70">
                        {String((payload.project.aiAnalysis as { note?: string }).note ?? "AI 보조 참고용 시각화입니다.")}
                      </p>
                    </div>
                    <dl className="space-y-1 text-[11px]">
                      <div className="flex justify-between border-b border-white/5 pb-1">
                        <dt className="text-slate-500">분석 모드</dt>
                        <dd className="text-slate-300">{payload.project.aiMode === "EXTERNAL_VISION" ? "외부 AI 비전" : "규칙 기반(휴리스틱)"}</dd>
                      </div>
                      {payload.project.aiAnalysis && typeof payload.project.aiAnalysis === "object" ? (
                        <>
                          <div className="flex justify-between border-b border-white/5 pb-1">
                            <dt className="text-slate-500">추정 크기</dt>
                            <dd className="text-right text-slate-300">
                              {String((payload.project.aiAnalysis as { dimensions?: { width?: number; height?: number; unit?: string } }).dimensions?.width ?? "-")} ×{" "}
                              {String((payload.project.aiAnalysis as { dimensions?: { width?: number; height?: number; unit?: string } }).dimensions?.height ?? "-")}{" "}
                              {(payload.project.aiAnalysis as { dimensions?: { unit?: string } }).dimensions?.unit ?? ""}
                              <span className="text-slate-500"> · 깊이 미확인</span>
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-slate-500">신뢰도</dt>
                            <dd className="text-slate-300">{Math.round(Number((payload.project.aiAnalysis as { confidence?: number }).confidence ?? 0) * 100)}%</dd>
                          </div>
                        </>
                      ) : null}
                    </dl>
                    {Array.isArray((payload.project.aiAnalysis as { suggestions?: { title: string; detail: string; basis: string }[] }).suggestions) ? (
                      <div className="space-y-2">
                        {((payload.project.aiAnalysis as { suggestions?: { title: string; detail: string; basis: string }[] }).suggestions ?? []).map((s, i) => (
                          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                            <p className="text-[11px] font-semibold text-slate-200">{s.title}</p>
                            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{s.detail}</p>
                            <p className="mt-1 text-[9px] text-slate-600">근거: {s.basis}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray((payload.project.aiAnalysis as { uncertainties?: string[] }).uncertainties) &&
                    ((payload.project.aiAnalysis as { uncertainties?: string[] }).uncertainties ?? []).length > 0 ? (
                      <div className="rounded-lg border border-rose-300/20 bg-rose-400/5 p-2.5">
                        <p className="text-[10px] font-bold text-rose-200">확정하지 않은 정보</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-relaxed text-rose-100/60">
                          {((payload.project.aiAnalysis as { uncertainties?: string[] }).uncertainties ?? []).map((u, i) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {editable ? (
                      <div className="rounded-lg border border-white/10 p-2.5">
                        <p className="text-[10px] leading-relaxed text-slate-400">정확한 3D 모델(STEP/GLB/STL/OBJ)을 추가로 업로드하면 참고용 시각화를 실제 모델로 교체합니다.</p>
                        <input
                          ref={aiFileRef}
                          type="file"
                          className="hidden"
                          accept=".step,.stp,.stl,.obj,.glb,.gltf,.fbx,.3mf,.ifc"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadAiModel(file);
                          }}
                        />
                        <button type="button" className="btn btn-primary btn-sm mt-2 w-full" disabled={aiUploading} onClick={() => aiFileRef.current?.click()}>
                          {aiUploading ? "분석·변환 중…" : "3D 모델 추가 업로드"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2 text-[11px] text-slate-400">
                    <p className="font-semibold text-slate-200">{String((payload.project.aiAnalysis as { headline?: string }).headline ?? "3D 구조 분석")}</p>
                    {Array.isArray((payload.project.aiAnalysis as { suggestions?: { detail: string }[] }).suggestions)
                      ? ((payload.project.aiAnalysis as { suggestions?: { detail: string }[] }).suggestions ?? []).map((s, i) => (
                          <p key={i} className="rounded-lg bg-white/[0.03] p-2 text-[10px] leading-relaxed text-slate-400">
                            {s.detail}
                          </p>
                        ))
                      : null}
                    <p className="text-[10px] text-slate-500">3D 모델 메시에서 직접 추출한 구조 정보입니다.</p>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "export" ? (
              <div className="space-y-4">
                {!hasFeature("SNAPSHOT") ? <p className="badge badge-warn">현재 플랜에 이미지 출력 미포함</p> : null}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-200">고해상도 이미지</p>
                  <select className="input !py-1 !text-[11px]" value={snapshotSize} onChange={(e) => setSnapshotSize(e.target.value as "1920" | "2560" | "3840")}>
                    <option value="1920">1920 × 1080 (FHD)</option>
                    <option value="2560">2560 × 1440 (QHD)</option>
                    <option value="3840">3840 × 2160 (4K UHD)</option>
                  </select>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <input type="checkbox" checked={snapshotTransparent} onChange={(e) => setSnapshotTransparent(e.target.checked)} /> 투명 배경 (PNG)
                  </label>
                  <button type="button" className="btn btn-primary btn-sm w-full" disabled={!hasFeature("SNAPSHOT")} onClick={takeSnapshot}>
                    PNG 스냅샷 저장
                  </button>
                </div>
                <div className="divider" />
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-200">360° 회전 영상</p>
                  <div className="flex items-center gap-2">
                    <input type="range" min={4} max={20} value={videoDuration} onChange={(e) => setVideoDuration(Number(e.target.value))} className="flex-1" />
                    <span className="mono text-[11px] text-slate-400">{videoDuration}s</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm flex-1"
                      onClick={() => {
                        engineRef.current?.startTurntable(videoDuration * 1000);
                        showToast(`턴테이블 ${videoDuration}초 회전을 시작했습니다.`);
                      }}
                    >
                      회전 프리뷰
                    </button>
                    <button type="button" className="btn btn-primary btn-sm flex-1" disabled={recording || !hasFeature("VIDEO")} onClick={recordVideo}>
                      {recording ? "녹화 중…" : "녹화 · 다운로드"}
                    </button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Canvas MediaRecorder 로 녹화합니다. 브라우저가 MP4(avc1) 인코딩을 지원하면 .mp4, 아니면 .webm 으로 저장되며 결과를 정직하게 표시합니다.
                  </p>
                </div>
                <div className="divider" />
                <div className="space-y-1.5 text-[10px] leading-relaxed text-slate-500">
                  <p>· PDF 도안/이미지 스냅샷은 PNG 로 저장됩니다.</p>
                  <p>· 이미지와 영상에는 고객사 워터마크가 포함될 수 있습니다.</p>
                </div>
              </div>
            ) : null}

            {tab === "share" ? (
              <div className="space-y-3">
                {share ? (
                  <>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <p className="text-[10px] text-slate-500">공유 링크</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <input readOnly value={shareUrl} className="input !py-1 !text-[10px]" />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            void navigator.clipboard?.writeText(shareUrl);
                            showToast("공유 링크를 복사했습니다.");
                          }}
                        >
                          복사
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-slate-500">
                        <span className="badge !text-[9px]">{share.hasPassword ? "비밀번호 보호" : "공개"}</span>
                        <span className="badge !text-[9px]">{share.expiresAt ? `${new Date(share.expiresAt).toLocaleDateString("ko-KR")} 만료` : "만료 없음"}</span>
                        <span className="badge !text-[9px]">조회 {share.viewCount}</span>
                      </div>
                    </div>
                    {hasFeature("QR") ? (
                      <div className="rounded-lg border border-white/10 p-3 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/share/${share.slug}/qr?format=png&size=360`} alt="공유 QR 코드" className="mx-auto h-40 w-40 rounded-lg bg-white p-2" />
                        <div className="mt-2 flex gap-1.5">
                          <a href={`/api/share/${share.slug}/qr?format=png&size=1024&download=1`} className="btn btn-ghost btn-sm flex-1">
                            PNG
                          </a>
                          <a href={`/api/share/${share.slug}/qr?format=svg&download=1`} className="btn btn-ghost btn-sm flex-1">
                            SVG
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">현재 플랜에는 QR 코드가 포함되어 있지 않습니다.</p>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={shareBusy} onClick={() => createShare(true)}>
                        링크 재발급
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={disableShare}>
                        공유 중지
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-400">읽기 전용 쇼룸 링크를 만들어 고객에게 전달합니다. 로그인 없이 열람할 수 있습니다.</p>
                    <div>
                      <label className="label">비밀번호 (선택)</label>
                      <input className="input !py-1.5 !text-[11px]" value={shareForm.password} onChange={(e) => setShareForm({ ...shareForm, password: e.target.value })} placeholder="미입력 시 공개 링크" />
                    </div>
                    <div>
                      <label className="label">만료 (선택)</label>
                      <select className="input !py-1.5 !text-[11px]" value={shareForm.days} onChange={(e) => setShareForm({ ...shareForm, days: e.target.value })}>
                        <option value="0">만료 없음</option>
                        <option value="7">7일 후 만료</option>
                        <option value="30">30일 후 만료</option>
                        <option value="90">90일 후 만료</option>
                      </select>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm w-full" disabled={shareBusy} onClick={() => createShare(false)}>
                      {shareBusy ? "생성 중…" : "공유 링크 생성"}
                    </button>
                  </>
                )}
                <div className="rounded-lg border border-white/10 p-2.5 text-[10px] leading-relaxed text-slate-500">
                  공유 페이지는 읽기 전용으로 열리며 편집 도구와 원본 파일 다운로드는 제공하지 않습니다.
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* footer brand */}
      <div className="flex flex-none items-center justify-between border-t border-white/10 bg-[#060b13]/90 px-4 py-1.5 text-[10px] text-slate-500">
        <span>{payload.brand?.headerText ?? "EUM 3D SHOWROOM PRO"}</span>
        <span>{payload.brand?.footerText ?? "© 2026 EUM 3D SHOWROOM PRO"}</span>
      </div>

      {/* annotation modal */}
      {activeAnnotation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setActiveAnnotation(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-bold text-white">{activeAnnotation.title}</h3>
              <button type="button" className="text-slate-500 hover:text-white" onClick={() => setActiveAnnotation(null)}>
                ✕
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{activeAnnotation.body}</p>
            <p className="mono mt-3 text-[10px] text-slate-600">
              위치 {activeAnnotation.x.toFixed(2)}, {activeAnnotation.y.toFixed(2)}, {activeAnnotation.z.toFixed(2)}
            </p>
            {editable ? (
              <button type="button" className="btn btn-danger btn-sm mt-3 w-full" onClick={() => removeAnnotation(activeAnnotation.id)}>
                주석 삭제
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {annotationDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-white">3D 주석 추가</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              위치 {annotationDraft.position.map((v) => v.toFixed(2)).join(", ")}
            </p>
            <div className="mt-3 space-y-2">
              <input className="input !py-1.5 !text-[12px]" placeholder="제목" value={annotationDraft.title} onChange={(e) => setAnnotationDraft({ ...annotationDraft, title: e.target.value })} />
              <textarea className="input !py-1.5 !text-[12px]" rows={3} placeholder="설명" value={annotationDraft.body} onChange={(e) => setAnnotationDraft({ ...annotationDraft, body: e.target.value })} />
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setAnnotationDraft(null)}>
                취소
              </button>
              <button type="button" className="btn btn-primary btn-sm flex-1" onClick={addAnnotation}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-teal-300/30 bg-[#07131b]/95 px-4 py-2 text-[12px] text-teal-100 shadow-2xl backdrop-blur">{toast}</div> : null}

    </div>
  );
}
