export type SequenceAction = {
  part: number;
  to?: [number, number, number];
  rotateTo?: [number, number, number];
  spin?: [number, number, number];
  opacityTo?: number;
};

export type SequenceStep = { label: string; durationMs: number; actions: SequenceAction[] };

export type BuiltSequence = { name: string; kind: string; durationMs: number; steps: SequenceStep[] };

/**
 * 업종별 기본 애니메이션 시퀀스 생성.
 * part 인덱스는 프로젝트 부품의 order 순서와 같다.
 */
export function buildDefaultSequences(args: {
  industry: string;
  parts: { nodeName: string; name: string }[];
  sceneSize: number;
}): BuiltSequence[] {
  const { industry, parts, sceneSize } = args;
  const gap = Math.max(0.05, sceneSize * 0.55);
  const sequences: BuiltSequence[] = [];
  const find = (re: RegExp) => parts.findIndex((p) => re.test(p.name));
  const all = (re: RegExp) =>
    parts
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => re.test(p.name))
      .map(({ i }) => i);

  if (industry === "MOLD") {
    const cavity = find(/CAVITY|캐비티/i);
    const core = find(/CORE|코어/i);
    const slides = all(/SLIDE|슬라이드/i);
    const ejectors = all(/EJECT|이젝/i);
    const steps: SequenceStep[] = [
      {
        label: "1. 클램프 유닛 해제 · 금형 열기",
        durationMs: 1400,
        actions: [
          ...(cavity >= 0 ? [{ part: cavity, to: [0, gap, 0] as [number, number, number] }] : []),
          ...(core >= 0 ? [{ part: core, to: [0, gap * 0.35, 0] as [number, number, number] }] : []),
        ],
      },
      {
        label: "2. 캐비티 · 코어 분리",
        durationMs: 1600,
        actions: [
          ...(core >= 0 ? [{ part: core, to: [0, -gap * 0.9, 0] as [number, number, number] }] : []),
          ...(cavity >= 0 ? [{ part: cavity, to: [0, gap * 1.15, 0] as [number, number, number] }] : []),
        ],
      },
      {
        label: "3. 슬라이드 코어 후퇴",
        durationMs: 1200,
        actions: slides.map((idx) => ({
          part: idx,
          to: [gap * 0.8 * (idx % 2 === 0 ? 1 : -1), 0, 0] as [number, number, number],
        })),
      },
      {
        label: "4. 이젝터 핀 · 성형품 취출",
        durationMs: 1400,
        actions: [
          ...ejectors.map((idx) => ({ part: idx, to: [0, gap * 0.5, 0] as [number, number, number] })),
          ...(core >= 0 ? [{ part: core, to: [0, -gap * 0.9, 0] as [number, number, number] }] : []),
        ],
      },
      {
        label: "5. 원위치 복귀",
        durationMs: 1800,
        actions: parts.map((_, i) => ({
          part: i,
          to: [0, 0, 0] as [number, number, number],
          rotateTo: [0, 0, 0] as [number, number, number],
        })),
      },
    ];
    sequences.push({ name: "금형 개폐 시퀀스", kind: "MOLD", durationMs: steps.reduce((a, s) => a + s.durationMs, 0), steps });
  }

  if (industry === "MACHINE") {
    const gears = all(/GEAR|기어/i);
    const shaft = find(/SHAFT|SPINDLE|입력축|출력축/i);
    const fan = find(/FAN|팬|BLADE/i);
    const steps: SequenceStep[] = [
      {
        label: "1. 기동 — 입력축 회전",
        durationMs: 1800,
        actions: [
          ...(shaft >= 0 ? [{ part: shaft, spin: [0, 240, 0] as [number, number, number] }] : []),
          ...gears.map((idx) => ({ part: idx, spin: [0, idx % 2 === 0 ? 180 : -180, 0] as [number, number, number] })),
        ],
      },
      {
        label: "2. 정격 운전 — 감속비 확인",
        durationMs: 2600,
        actions: [
          ...(shaft >= 0 ? [{ part: shaft, spin: [0, 300, 0] as [number, number, number] }] : []),
          ...gears.map((idx) => ({ part: idx, spin: [0, idx % 2 === 0 ? 120 : -40, 0] as [number, number, number] })),
          ...(fan >= 0 ? [{ part: fan, spin: [0, 420, 0] as [number, number, number] }] : []),
        ],
      },
      { label: "3. 정지", durationMs: 900, actions: [] },
    ];
    sequences.push({ name: "기계 작동 시퀀스", kind: "MACHINE", durationMs: steps.reduce((a, s) => a + s.durationMs, 0), steps });
  }

  const groupCount = Math.min(4, Math.max(1, Math.ceil(parts.length / 4)));
  const assemblySteps: SequenceStep[] = [];
  for (let g = 0; g < groupCount; g++) {
    const from = Math.floor((g * parts.length) / groupCount);
    const to = Math.floor(((g + 1) * parts.length) / groupCount);
    assemblySteps.push({
      label: `${g + 1}단계 · ${parts[from]?.name ?? "부품"} 외 ${Math.max(0, to - from - 1)}개 조립`,
      durationMs: 1200,
      actions: parts.slice(from, to).map((_, k) => ({ part: from + k, to: [0, 0, 0] as [number, number, number], rotateTo: [0, 0, 0] as [number, number, number] })),
    });
  }
  assemblySteps.push({
    label: "완료 · 전체 조립 상태 확인",
    durationMs: 900,
    actions: parts.map((_, i) => ({
      part: i,
      to: [0, 0, 0] as [number, number, number],
      rotateTo: [0, 0, 0] as [number, number, number],
      opacityTo: 1,
    })),
  });
  sequences.push({ name: "단계별 조립 시퀀스", kind: "ASSEMBLY", durationMs: assemblySteps.reduce((a, s) => a + s.durationMs, 0), steps: assemblySteps });

  sequences.push({
    name: "360° 턴테이블",
    kind: "TURNTABLE",
    durationMs: 8000,
    steps: [{ label: "360° 회전 프리뷰", durationMs: 8000, actions: [] }],
  });

  return sequences;
}
