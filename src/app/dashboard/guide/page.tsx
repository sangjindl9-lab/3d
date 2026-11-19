import Link from "next/link";
import { FORMATS, PIPELINE_STEPS_HINT } from "./formats-data";

export default function GuidePage() {
  const grouped = [
    { title: "즉시 변환 · 표시 (서버 내장)", items: FORMATS.filter((f) => f.converter === "BUILT_IN" && f.kind === "3D"), tone: "teal" },
    { title: "2D 도면 · 참고용 시각화", items: FORMATS.filter((f) => f.converter === "BUILT_IN" && f.kind === "2D"), tone: "amber" },
    { title: "형식 분석 후 외부 변환 필요", items: FORMATS.filter((f) => f.converter === "EXTERNAL_REQUIRED"), tone: "slate" },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 md:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Guide</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight">지원 형식 · 파이프라인 · 정직한 제약</h1>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        EUM 3D SHOWROOM PRO 는 실행되는 기능과 외부 연동이 필요한 기능을 분리해 안내합니다. 변환되지 않은 파일을 변환된 것처럼 표시하지 않습니다.
      </p>

      <section className="card mt-5 p-5">
        <h2 className="text-sm font-black">자동 변환 10단계</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {PIPELINE_STEPS_HINT.map((step) => (
            <div key={step.step} className="flex items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
              <span className="mono mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-teal-400/15 text-[10px] text-teal-300">{step.step}</span>
              <div>
                <p className="text-[11px] font-semibold text-slate-200">{step.label}</p>
                <p className="text-[10px] text-slate-500">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {grouped.map((group) => (
        <section key={group.title} className="card mt-4 p-5">
          <h2 className="text-sm font-black">{group.title}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[11px]">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2">형식</th>
                  <th>확장자</th>
                  <th>판별</th>
                  <th>처리 방식</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((format) => (
                  <tr key={format.id} className="border-t border-white/5 align-top">
                    <td className="py-2 font-semibold text-slate-200">{format.label}</td>
                    <td className="mono text-slate-500">.{format.extensions.join(", .")}</td>
                    <td>
                      <span className="badge !text-[9px]">{format.kind}</span>
                    </td>
                    <td className="py-2 text-slate-400">{format.note ?? "서버에서 메시 파싱 · GLB 생성"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-black">AI 3D 시각화 모드</h2>
        <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-400">
          <p>
            <span className="badge badge-warn !text-[9px]">규칙 기반</span> 외부 AI 비전 API 키가 설정되지 않은 기본 모드입니다. DXF 의 레이어·엔티티·문자
            정보를 규칙으로 해석해 참고용 3D 형상을 제안합니다. 깊이·내부 구조·재질은 임의로 확정하지 않고 화면과 분석 패널에 불확실 항목으로 표시합니다.
          </p>
          <p>
            <span className="badge badge-accent !text-[9px]">외부 AI 비전</span> <code className="mono">AI_VISION_API_KEY</code> 가 설정된 경우 외부 비전 분석을
            사용할 수 있습니다. 키가 없는데 분석된 것처럼 표시하지 않습니다.
          </p>
          <p className="text-slate-500">
            JPG/PNG/TIFF 는 서버에서 픽셀을 직접 디코딩해 잉크(선) 윤곽을 추출하고, 원본 이미지를 정면 텍스처로 입힌 도면 블록 + 윤곽 돌출(릴리프) 부품으로 참고용 3D 를
            만듭니다. PDF 는 첫 페이지를 PNG 로 렌더한 뒤 같은 파이프라인을 타며(렌더러가 없으면 원본 패널 폴백 + 안내), DWG 는 바이너리 형식이라 DXF 변환 후 시각화를
            안내합니다. 어느 경우든 깊이·내부 구조는 임의로 확정하지 않고 &ldquo;참고용&rdquo; 배지와 불확실 항목으로 표시합니다.
          </p>
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-black">이 플랫폼이 하지 않는 일</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          CAD 도면 작성, 2D 제도, 3D 부품 설계, 정밀 치수 수정, 파라메트릭 설계, 금형·기계 부품 설계, CNC/CAM 경로, 구조·유동 해석, 전기회로 설계,
          BIM 설계 편집, 원본 CAD 형상 수정 및 설계도면 재출력은 제공하지 않습니다. 쇼룸의 부품 이동·분해·카메라·재질·애니메이션 편집은 장면 데이터에만
          저장되며 업로드한 원본 파일은 변경되지 않습니다.
        </p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-black">업로드 팁</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-slate-400">
          <li>GLB/GLTF 는 노드 이름이 부품명으로 매핑됩니다. 부품 계층을 잘 나누면 쇼룸 품질이 좋아집니다.</li>
          <li>STL 은 연결 요소 분석으로 부품을 자동 분리하며, 재질 정보는 포함되지 않아 추정값으로 표시됩니다.</li>
          <li>OBJ 는 o/g 그룹을 부품으로 사용합니다. 그룹이 없으면 단일 부품이 됩니다.</li>
          <li>DXF 는 ASCII DXF 를 지원합니다. 단위는 $INSUNITS 를 읽고, 없으면 mm 로 가정합니다.</li>
          <li>80MB 이하 파일을 권장하며, 대용량 모델은 메시 최적화 단계에서 중복 정점을 정리합니다.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard/projects/new" className="btn btn-primary btn-sm">
            샘플로 쇼룸 만들기
          </Link>
          <a href="/api/files/samples/sample-plate.dxf" download className="btn btn-ghost btn-sm">
            샘플 DXF
          </a>
          <a href="/api/files/samples/sample-bracket.stl" download className="btn btn-ghost btn-sm">
            샘플 STL
          </a>
        </div>
      </section>
    </div>
  );
}
