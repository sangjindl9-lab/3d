# 🏭 EUM 3D SHOWROOM PRO (이음 3D 쇼룸 프로)

산업용 **3D 쇼룸 플랫폼**. CAD·도면을 업로드하면 10단계 파이프라인이 웹 표시용 GLB 를 만들고, 실감형 3D 쇼룸 · 부품 분해도 · 조립/금형/기계 애니메이션 · X-Ray · 주석 · 360° 영상 · 이미지 · 공유 링크/QR · 고객사 화이트라벨 · 라이선스 관리까지 하나의 웹 애플리케이션에서 동작합니다.

> **정직한 범위 고지**
> - GLB/GLTF/STL/OBJ/DXF 는 서버에서 **실제 파싱 · GLB 생성**까지 수행합니다.
> - STEP/IGES/FBX/3MF/IFC 및 SolidWorks·Inventor·CATIA·NX·Creo·SketchUp 은 **형식·메타 분석까지만** 지원하며, 표준 GLB 변환은 외부 CAD 변환기가 필요합니다. 변환된 것처럼 표시하지 않습니다.
> - 2D 도면 시각화는 `참고용 AI 3D 시각화` 로 명확히 표시하며, 깊이·내부 구조·재질을 임의로 확정하지 않습니다. 외부 AI 비전 API 키가 없으면 **규칙 기반(휴리스틱) 분석 모드**로 동작합니다.
> - 쇼룸의 부품 이동·분해·재질·애니메이션 편집은 **장면 데이터에만** 저장되고 업로드한 원본 파일은 절대 수정하지 않습니다.

---

## 1. 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router, TypeScript), React 19 |
| 스타일 | Tailwind CSS 4 |
| 3D | Three.js 0.187 직접 구현 (React Three Fiber 미사용, SSR 충돌 방지) |
| DB/ORM | Prisma 6 + SQLite (`DATABASE_URL="file:./dev.db"`) |
| 인증 | 자체 세션(HTTP-only 쿠키) + Node `scrypt` 해시 |
| QR | `qrcode` (PNG/SVG 서버 생성) |
| 래스터 도면 | `sharp` (서버 PNG/JPG/TIFF 디코딩·텍스처 정규화) |
| 테스트 | Vitest 3 (57 케이스) + HTTP 스모크 스크립트 |

## 2. 실행 방법

```bash
cd eum3d-showroom-pro
npm install
npm run db:setup          # prisma generate + db push + seed
npm run dev               # http://localhost:3210
```

프로덕션:

```bash
npm run build
npm run start             # http://localhost:3210
```

검증:

```bash
npm run typecheck
npm run test              # vitest, 57 tests
npm run build
npm run smoke             # 실제 서버 기동 후 페이지/API·이미지/PDF 도면 42개 체크
```

`npm run smoke` 는 3210 포트에 프로덕션 서버를 직접 띄웁니다.

**2D 도면(PDF) 요구사항** — PNG/JPG/TIFF 는 `sharp` 만으로 동작합니다. PDF 첫 페이지 렌더는 `pdftoppm`(poppler) → `python3`(PyMuPDF 또는 pypdfium2) → `gs`(Ghostscript) 순으로 시도하며, 모두 없으면 원본 도면 패널 폴백과 안내 문구를 남깁니다. PDF 를 이미지로 내보내 업로드하면 렌더러 없이도 3D 릴리프가 생성됩니다.

## 3. 데모 계정

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 시스템 관리자 (ADMIN) | `admin@eum3d.kr` | `Eum3d!2026` |
| 고객사 관리자 (에스에스전력) | `ss@eum3d.kr` | `SsPower!2026` |
| 고객사 관리자 (한빛정밀금형) | `hb@eum3d.kr` | `Hanbit!2026` |
| 일반 사용자 (에스에스전력) | `user@eum3d.kr` | `User!2026` |
| 만료 라이선스 예시 | `expired@eum3d.kr` | `Expired!2026` |

### 공개 데모 쇼룸 (로그인 불필요)

| 데모 | 공유 URL | 비고 |
| --- | --- | --- |
| 사출금형 개폐 | `/share/mold-demo` | 금형 개폐 시퀀스, 22개 부품 |
| 기어 감속기 | `/share/gearbox-demo` | 기계 작동 애니메이션 |
| 전기 분전반 | `/share/panel-demo` | **비밀번호 `eum2026`**, X-Ray |
| 플랜트 배관 | `/share/plant-demo` | 30일 만료 설정 예시 |
| 2D 도면 AI 시각화 | `/share/drawing-demo` | 참고용 AI 3D (DXF 파싱) |

쇼룸 템플릿 7종(고급 전시관·산업 장비·금형 기술·전자·건축·다크·화이트)은 뷰어 우측 상단에서 즉시 전환됩니다.

## 4. 구현된 20개 핵심 기능

1. **업로드** — 드래그앤드롭, 다중(최대 8개), XHR 진행률, 80MB 제한
2. **형식 자동 분석** — 매직 바이트 + 확장자 + 2D/3D 판별 + SHA-256 무결성, 불일치 경고
3. **3D 변환·표시** — glTF 2.0 GLB 직접 인코딩, 메시/정점/삼각형 통계, 최적화 리포트
4. **2D AI 보조 3D** — DXF 엔티티/레이어 파싱 → 참고용 relief 3D, PNG/JPG/TIFF 는 서버에서 픽셀을 직접 디코딩한 윤곽 돌출 + 원본 텍스처 도면 블록, PDF 는 첫 페이지 PNG 렌더 후 같은 파이프라인, `참고용` 배지·불확실 항목 고지·3D 모델 추가 업로드 버튼
5. **실감형 3D 쇼룸** — Three.js 실시간 렌더, PBR, 그림자, 절차적 PMREM 환경맵, 4종 배경
6. **분해도** — 조립 중심 기반 방향 벡터 자동 계산, 전체 슬라이더, 부품별 방향/거리 편집, TransformControls 3D 드래그
7. **조립 애니메이션** — 스텝 타임라인, 재생/일시정지/정지/속도/스텝 이동
8. **금형 개폐** — 코어·캐비티·슬라이드·이젝터 시퀀스 (시드 및 MOLD 업종 자동 생성)
9. **기계 작동** — 기어·축·팬 회전/이동 모션
10. **부품 정보** — 재질·규격·중량·수량·설명·부품번호 표시 및 편집
11. **내부 투시** — X-Ray 전체 투시, 부품별 투명화, 전체/부분 단면(Clipping X/Y/Z)
12. **주석** — 3D 공간 클릭으로 핀 생성, 목록/상세/삭제, 공유 페이지에서 열람
13. **360° 회전 영상** — 턴테이블 프리뷰, MediaRecorder 녹화(MP4 지원 시 MP4, 아니면 WebM 고지)
14. **MP4 동영상** — Canvas captureStream + MediaRecorder, 다운로드
15. **이미지 출력** — FHD/QHD/4K PNG, 투명 배경 옵션, 뷰어 캡처를 썸네일로 저장
16. **공유 URL** — `/share/[slug]` 읽기 전용, 비밀번호(scrypt), 만료일, 조회수, 재발급 시 기존 링크 무효화
17. **QR 코드** — PNG/SVG 즉시 생성·다운로드
18. **화이트라벨** — 고객사명·로고·포인트/보조 컬러·슬로건·헤더/푸터, 쇼룸·공유 페이지 반영
19. **사용자·관리자** — 회원가입/로그인/세션, ADMIN·CLIENT_ADMIN·USER, 대시보드·사용자 관리
20. **라이선스** — 고객사 플랜/만료/프로젝트·사용자 한도/허용 기능 실시간 검증

### 배제 범위 준수
CAD 도면 작성, 2D 제도, 3D 부품 설계, 정밀 치수 수정, 파라메트릭 설계, 금형·기계 설계, CNC/CAM, 구조·유동 해석, 전기회로 설계, BIM 설계 편집, 원본 CAD 수정, 설계도면 재출력은 **구현하지 않았습니다.** 쇼룸 편집은 장면(DB)에만 적용됩니다.

## 5. 페이지 · API 구조

### 페이지

| 경로 | 설명 |
| --- | --- |
| `/` | 랜딩(기능·산업군·템플릿·데모) |
| `/login`, `/signup` | 인증 |
| `/dashboard` | 라이선스 사용량·프로젝트·데모 |
| `/dashboard/projects/new` | 업로드 마법사 + 10단계 진행 UI |
| `/dashboard/projects/[id]` | 3D 쇼룸 편집기 (뷰어 + 도구 패널) |
| `/dashboard/clients` | 고객사·라이선스 목록 (관리자) |
| `/dashboard/clients/[id]` | 브랜딩·라이선스·사용자 관리 |
| `/dashboard/guide` | 지원 형식·파이프라인·제약 안내 |
| `/share/[slug]` | 읽기 전용 공유 쇼룸 (비밀번호·만료) |

### API

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /api/auth/register` · `login` · `logout` | 세션 인증 |
| `GET/POST /api/projects` | 목록/생성 (라이선스 검증) |
| `GET/PATCH/DELETE /api/projects/[id]` | 상세·수정·삭제 (원본 파일 미변경) |
| `POST /api/projects/[id]/upload` | multipart 업로드 + 형식 분석 |
| `POST /api/projects/[id]/process` | 10단계 파이프라인 실행 |
| `GET /api/projects/[id]/pipeline` | 단계별 상태 |
| `PUT /api/projects/[id]/thumbnail` | 뷰어 캡처 썸네일 |
| `POST /api/projects/[id]/annotations` · `PATCH/DELETE /api/annotations/[id]` | 3D 주석 |
| `POST /api/projects/[id]/presets` · `DELETE /api/presets/[id]` | 카메라 프리셋 |
| `POST/DELETE /api/projects/[id]/share` | 공유 발급/중지 |
| `GET /api/share/[slug]/qr` | QR PNG/SVG |
| `POST /api/share/[slug]/unlock` | 비밀번호 쿠키 검증 |
| `PATCH /api/parts/[id]` | 부품 정보·분해 벡터·표시 상태 |
| `GET/POST /api/clients` · `PATCH /api/clients/[id]` | 고객사·라이선스 |
| `POST /api/clients/[id]/logo` | 로고 업로드 |
| `GET/POST /api/users` · `PATCH /api/users/[id]` | 사용자 관리 |
| `GET /api/files/[...path]` | 업로드/변환 산출물 서빙 |
| `GET /api/health` | 헬스체크 |

## 6. 변환 파이프라인

```
1 업로드 → 2 형식/무결성 → 3 2D/3D 판별 → 4 부품 구조 분석
→ 5 변환 → 6 GLB 생성 → 7 메시 최적화 → 8 썸네일 → 9 프로젝트 저장 → 10 뷰어 실행
```

각 단계는 `PipelineStage` 로 DB 에 상태·상세가 기록되고, 업로드 마법사가 실시간으로 표시합니다.

### 지원 형식 매트릭스

| 형식 | 종류 | 처리 |
| --- | --- | --- |
| GLB / GLTF | 3D | 내장 파서, 노드 계층 → 부품 |
| STL | 3D | 바이너리/ASCII 파싱, 연결 요소 기반 부품 분리 |
| OBJ | 3D | o/g 그룹 → 부품, fan 삼각분할 |
| DXF | 2D | 엔티티/레이어/Extents 파싱 → 참고용 3D relief |
| PNG / JPG / TIFF | 2D | sharp 디코딩 → 잉크 윤곽 추출 → 원본 텍스처 블록 + 윤곽 돌출 3D 릴리프 |
| PDF | 2D | 첫 페이지 PNG 렌더(pdftoppm/ghostscript/python3) → 이미지 윤곽 기반 3D 릴리프 |
| DWG | 2D | 버전 판별, DXF 변환 권장 |
| STEP / IGES / IFC | 3D CAD | 스키마·엔티티·제품명 메타 분석, **외부 변환기 필요** |
| FBX / 3MF | 3D | 메타 분석, **외부 변환기 필요** |
| SolidWorks / Inventor / CATIA / NX / Creo / SketchUp | 3D | 형식 인식, **공식 API·변환기 미연동 안내** |

## 7. 데이터 모델 (Prisma)

`Client`(플랜·만료·한도·기능·브랜딩) → `User`(ADMIN/CLIENT_ADMIN/USER) → `Project` → `Part` · `Annotation` · `CameraPreset` · `AnimationSequence` · `Upload` · `PipelineRun`/`PipelineStage` · `ShareLink` · `Session` · `AuditLog`

## 8. 디렉터리 구조

```
eum3d-showroom-pro/
├── prisma/
│   ├── schema.prisma          데이터 모델
│   ├── seed.ts                5개 데모 + 고객사 3곳 + 계정 + 공유 링크
│   └── seed-models.ts         절차적 3D 데모 모델(금형/감속기/분전반/배관/DXF)
├── scripts/smoke.mjs          HTTP 스모크 테스트(42 checks)
├── src/
│   ├── app/                   App Router 페이지 · API
│   ├── components/showroom/
│   │   ├── engine.ts          Three.js 쇼룸 엔진(분해/X-Ray/단면/애니/녹화)
│   │   ├── ShowroomShell.tsx  편집기 UI
│   │   └── ShowroomClient.tsx 지연 로딩 래퍼
│   └── lib/
│       ├── formats.ts         매직바이트 · 형식 분석
│       ├── glb.ts             GLB 인코더/디코더 · 형상 유틸
│       ├── parsers/           STL · OBJ · DXF 파서
│       ├── reference.ts       참고용 3D 생성 · AI 분석 객체
│       ├── pipeline.ts        10단계 파이프라인
│       ├── license.ts         라이선스 검증
│       ├── permissions.ts     역할 권한
│       ├── share.ts           공유 링크 서비스
│       ├── branding.ts        화이트라벨 정규화
│       └── storage.ts         파일 저장 · 썸네일
├── storage/                   업로드/GLB/썸네일/샘플 (런타임 생성)
└── tests/                     Vitest 44 케이스
```

## 9. 검증 결과 (2026-11-19 기준)

| 항목 | 결과 |
| --- | --- |
| `npx prisma generate && prisma db push && tsx prisma/seed.ts` | 성공 (고객사 3, 사용자 5, 데모 5, 공유 링크 5) |
| `npm run typecheck` | 오류 0 |
| `npm run build` | 성공 (앱 라우트 35개) |
| `npm run test` | **46 / 46 통과** |
| `npm run smoke` | **33 / 33 통과** |

테스트 커버리지: 형식 판별 8, GLB 4, Three.js 로더 호환 2, 파이프라인 5(STL/DXF/STEP/누락), 라이선스 7, 권한 5, 인증·브랜딩 8, 공유·QR 8.

## 10. 알려진 제약 · 다음 단계

- STEP/IGES 등 B-Rep 변환은 외부 CAD 커널(예: CAD Exchanger, Autodesk Platform Services) 연동이 필요합니다. 현재는 형식 분석 + 안내만 제공합니다.
- PNG/JPG/TIFF/PDF 의 3D 는 픽셀 윤곽을 돌출시킨 **참고용 시각화**이며 치수·형상을 복원하지 않습니다. 정확한 형상은 GLB/STL/OBJ 업로드가 필요합니다.
- 브라우저가 MP4 인코딩(avc1)을 지원하지 않으면 360° 영상은 WebM 으로 저장됩니다. 서버 FFmpeg 변환은 미구현입니다.
- STL 은 재질·부품명 정보가 없어 재질은 추정값으로 표시합니다.
- 공유 페이지는 읽기 전용이며 원본 파일 다운로드와 편집 도구를 제공하지 않습니다.
- 실서비스 배포 시 `DATABASE_URL`(PostgreSQL 전환), 스토리지(S3), `APP_SECRET` 교체가 필요합니다.
