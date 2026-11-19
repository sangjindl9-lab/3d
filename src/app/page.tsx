import Link from "next/link";
import { prisma } from "@/lib/db";
import { INDUSTRIES, TEMPLATES, industryLabel } from "@/lib/constants";
import { fileUrl } from "@/lib/storage";
import { getCurrentUser } from "@/lib/session";

const FEATURES = [
  ["CAD·PDF·3D 업로드", "드래그앤드롭 · 다중 업로드 · 진행률"],
  ["형식 자동 분석", "매직 바이트 · 확장자 · 2D/3D 판별 · 무결성"],
  ["3D 모델 변환·표시", "GLB 생성 · 메시 통계 · 최적화"],
  ["2D 도면 AI 3D 시각화", "DXF 파싱 · 참고용 3D · 명확한 고지"],
  ["실감형 3D 쇼룸", "Three.js/WebGL 실시간 렌더링"],
  ["부품별 자동 분해도", "방향 벡터 자동 계산 · 위치 편집"],
  ["단계별 조립 애니메이션", "타임라인 · 재생/속도/스텝 이동"],
  ["금형 개폐 애니메이션", "코어·캐비티·슬라이드·이젝터"],
  ["기계 작동 애니메이션", "회전·왕복·이송 모션"],
  ["부품별 정보", "재질·규격·중량·수량·부품번호"],
  ["내부 투시", "X-Ray · 전체/부품 투명화"],
  ["3D 주석", "공간 핀 추가·편집·보기"],
  ["360° 회전 영상", "턴테이블 프리뷰 · 녹화"],
  ["MP4 동영상", "Canvas MediaRecorder · WebM/MP4"],
  ["고해상도 이미지", "PNG/JPG · 투명 배경 · 4K"],
  ["웹주소 공유", "읽기 전용 링크 · 비밀번호·만료"],
  ["QR 코드", "즉시 생성 · PNG/SVG 다운로드"],
  ["고객사별 브랜딩", "화이트라벨 · 로고·컬러·슬로건"],
  ["사용자·관리자", "ADMIN · CLIENT_ADMIN · USER"],
  ["고객사 라이선스", "플랜·만료·한도·기능 실시간 검증"],
];

export default async function Home() {
  const [demos, user] = await Promise.all([
    prisma.project.findMany({
      where: { isPublicDemo: true },
      include: { client: true, shareLinks: { where: { isActive: true }, take: 1 }, _count: { select: { parts: true } } },
      orderBy: { createdAt: "asc" },
      take: 6,
    }),
    getCurrentUser(),
  ]);

  return (
    <div>
      <header className="sticky top-0 z-40 glass-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-sky-400 text-[14px] font-black text-[#04121a]">E</span>
            <span>
              <span className="block text-[12px] font-black leading-tight tracking-tight">EUM 3D SHOWROOM</span>
              <span className="block text-[9px] uppercase tracking-[0.22em] text-slate-500">Industrial Showroom Pro</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#features" className="nav-link">
              기능
            </a>
            <a href="#industries" className="nav-link">
              산업군
            </a>
            <a href="#templates" className="nav-link">
              템플릿
            </a>
            <a href="#demos" className="nav-link">
              데모 쇼룸
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            {user ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm">
                대시보드
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  로그인
                </Link>
                <Link href="/signup" className="btn btn-primary btn-sm">
                  시작하기
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div className="absolute -left-40 top-10 h-96 w-96 rounded-full bg-teal-400/10 blur-[120px]" />
          <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-sky-500/10 blur-[120px]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="float-in">
              <span className="badge badge-accent">산업용 3D 쇼룸 플랫폼 · 5대 업종 프리셋</span>
              <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
                금형·장비·설비를
                <br />
                <span className="bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">눈으로 설명하는</span>
                <br />
                3D 쇼룸.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
                CAD와 2D 도면을 업로드하면 자동 변환·분해도·조립/금형/기계 애니메이션·내부 투시까지. 고객에게 링크와 QR로 바로 전달하고
                고객사 브랜드로 화이트라벨링하세요.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                <Link href="/dashboard/projects/new" className="btn btn-primary">
                  무료로 쇼룸 만들기
                </Link>
                <a href="#demos" className="btn btn-ghost">
                  데모 쇼룸 체험 →
                </a>
              </div>
              <div className="mt-8 grid max-w-md grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="mono text-2xl font-black text-slate-100">20</p>
                  <p className="text-slate-500">핵심 기능</p>
                </div>
                <div>
                  <p className="mono text-2xl font-black text-slate-100">10</p>
                  <p className="text-slate-500">자동 변환 단계</p>
                </div>
                <div>
                  <p className="mono text-2xl font-black text-slate-100">7</p>
                  <p className="text-slate-500">쇼룸 템플릿</p>
                </div>
              </div>
            </div>
            <div className="relative float-in">
              <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-teal-400/20 to-sky-500/10 blur-2xl" />
              <div className="card overflow-hidden !rounded-[28px]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-400/70" />
                    <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                    <span className="h-2 w-2 rounded-full bg-teal-400/70" />
                  </div>
                  <span className="text-[10px] text-slate-500">EUM 3D · 사출금형 개폐 데모</span>
                </div>
                <div className="relative aspect-[4/3] bg-[radial-gradient(circle_at_50%_35%,#173245,#070c14_70%)]">
                  <svg viewBox="0 0 400 300" className="h-full w-full">
                    <defs>
                      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#8fa5bb" />
                        <stop offset="0.5" stopColor="#4b5f74" />
                        <stop offset="1" stopColor="#243442" />
                      </linearGradient>
                      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#2dd4bf" />
                        <stop offset="1" stopColor="#38bdf8" />
                      </linearGradient>
                    </defs>
                    <ellipse cx="200" cy="256" rx="130" ry="18" fill="#000" opacity="0.5" />
                    <g opacity="0.95">
                      <path d="M120 240 L200 270 L280 240 L200 210 Z" fill="#2a3a4a" />
                      <path d="M120 232 L200 262 L280 232 L200 202 Z" fill="url(#steel)" />
                      <path d="M136 208 L200 232 L264 208 L200 184 Z" fill="#33485c" />
                      <path d="M150 186 L200 206 L250 186 L200 166 Z" fill="url(#steel)" />
                      <path d="M150 120 L200 140 L250 120 L200 100 Z" fill="url(#steel)" />
                      <path d="M150 112 L200 132 L250 112 L200 92 Z" fill="#516a80" />
                      <path d="M136 92 L200 116 L264 92 L200 68 Z" fill="#2a3a4a" />
                      <path d="M120 76 L200 106 L280 76 L200 46 Z" fill="url(#steel)" />
                      <path d="M120 68 L200 98 L280 68 L200 38 Z" fill="#5b7a92" />
                      <path d="M150 120 L150 166" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />
                      <path d="M250 120 L250 166" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />
                      <circle cx="200" cy="88" r="10" fill="url(#accent)" opacity="0.85" />
                    </g>
                    <text x="24" y="34" fill="#5eead4" fontSize="10" fontFamily="monospace">EUM 3D SHOWROOM / MOLD</text>
                    <text x="24" y="50" fill="#64748b" fontSize="8" fontFamily="monospace">EXPLODED VIEW · 3 STAGE SEQUENCE</text>
                  </svg>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] text-slate-300 backdrop-blur">
                    분해도 · 금형 개폐 · X-Ray · 360° 영상
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/10 text-center">
                  {[
                    ["부품", "22"],
                    ["재질", "STEEL"],
                    ["템플릿", "MOLD TECH"],
                  ].map(([k, v]) => (
                    <div key={k} className="px-3 py-2.5">
                      <p className="text-[9px] uppercase tracking-wider text-slate-600">{k}</p>
                      <p className="mono text-[11px] text-slate-300">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-white/10 bg-[#060a11]/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">20 Core Features</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">업로드부터 공유까지, 전부 동작합니다</h2>
              </div>
              <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
                데모용 목업이 아니라 실제 파이프라인·DB·API 로 동작합니다. 외부 상용 변환기나 AI 비전 키가 필요한 부분은 숨기지 않고 모드를 분리해 안내합니다.
              </p>
            </div>
            <div className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(([title, desc], index) => (
                <div key={title} className="card-soft p-4 transition hover:border-teal-300/25 hover:bg-white/[0.04]">
                  <span className="mono text-[10px] text-teal-300/70">{String(index + 1).padStart(2, "0")}</span>
                  <p className="mt-1.5 text-[12px] font-bold text-slate-200">{title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Industries</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">5대 산업군에 맞춘 쇼룸 프리셋</h2>
            <div className="mt-7 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => (
                <div key={industry.key} className="card p-5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl text-lg" style={{ background: `${industry.accent}1a`, color: industry.accent }}>
                      {industry.icon}
                    </span>
                    <div>
                      <p className="text-[13px] font-bold">{industry.label}</p>
                      <p className="text-[10px] text-slate-500">대표 예시 · {industry.sampleProject}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{industry.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {industry.categories.slice(0, 6).map((category) => (
                      <span key={category} className="badge !text-[9px]">
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="card flex flex-col justify-between p-5">
                <div>
                  <p className="text-[13px] font-bold">공통 업로드·변환 파이프라인</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    모든 산업군이 같은 10단계 파이프라인을 사용합니다: 업로드 → 형식/무결성 → 2D/3D 판별 → 구조 분석 → 변환 → GLB → 최적화 → 썸네일 → 저장 → 뷰어 실행.
                  </p>
                </div>
                <Link href="/dashboard/projects/new" className="btn btn-ghost btn-sm mt-4 self-start">
                  쇼룸 만들기 →
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="templates" className="border-b border-white/10 bg-[#060a11]/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Showroom Templates</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">즉시 전환 가능한 7개 쇼룸 템플릿</h2>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {TEMPLATES.map((template) => (
                <div key={template.key} className="card-soft overflow-hidden">
                  <div className="h-20" style={{ background: `linear-gradient(135deg, ${template.floorColor}, #05080f 70%)` }}>
                    <div className="flex h-full items-end justify-between p-3">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: template.accent }} />
                      <span className="text-[9px] uppercase tracking-wider text-white/40">{template.background}</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-bold">{template.label}</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">{template.tagline}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="demos" className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/70">Live Demos</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">로그인 없이 체험하는 5개 데모</h2>
              </div>
              <p className="text-[11px] text-slate-500">금형 개폐 · 감속기 · 분전반 · 플랜트 배관 · 2D AI 시각화</p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {demos.map((demo) => {
                const href = demo.shareLinks[0]?.slug ? `/share/${demo.shareLinks[0].slug}` : `/dashboard/projects/${demo.id}`;
                return (
                  <Link key={demo.id} href={href} className="card group overflow-hidden transition hover:border-teal-300/30">
                    <div className="relative aspect-[16/9] overflow-hidden bg-[#0a111b]">
                      {fileUrl(demo.thumbnailPath) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(demo.thumbnailPath)!} alt={demo.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                      ) : null}
                      {demo.isAiReference ? <span className="badge badge-warn absolute left-2 top-2">참고용 AI</span> : null}
                      {demo.shareLinks[0]?.passwordHash ? <span className="badge absolute right-2 top-2">🔒 비밀번호</span> : null}
                    </div>
                    <div className="p-4">
                      <p className="text-[13px] font-bold">{demo.title}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{demo.description}</p>
                      <p className="mt-2 text-[10px] text-slate-600">
                        {industryLabel(demo.industry)} · {demo.client?.name} · 부품 {demo._count.parts}개
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-20" />
          <div className="relative mx-auto max-w-4xl px-4 py-20 text-center md:px-6">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              도면 한 장으로 시작하는
              <br />
              <span className="bg-gradient-to-r from-teal-300 to-sky-400 bg-clip-text text-transparent">고객용 3D 쇼룸</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-slate-400">
              GLB·STL·OBJ·DXF 는 즉시 3D 로 변환됩니다. STEP/IGES 등 B-Rep 형식은 형식·메타 분석 후 표준 GLB 변환을 안내하며, 변환된 것처럼
              표시하지 않습니다. AI 비전 키가 없으면 규칙 기반 분석 모드로 동작합니다.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Link href="/signup" className="btn btn-primary">
                무료 계정 만들기
              </Link>
              <Link href="/share/drawing-demo" className="btn btn-ghost">
                2D 도면 AI 시각화 데모
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-[10px] text-slate-600 md:px-6">
          <span>© 2026 EUM 3D SHOWROOM PRO · 이음 3D 쇼룸 프로</span>
          <span>쇼룸 편집은 장면에만 적용되며 원본 CAD 파일은 수정되지 않습니다.</span>
        </div>
      </footer>
    </div>
  );
}
