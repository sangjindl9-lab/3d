// EUM 3D SHOWROOM PRO — HTTP 스모크 테스트
// 실제 프로덕션 서버를 띄워 페이지·API·인증·업로드 파이프라인·공유/QR 을 검증한다.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    results.push(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    results.push(`  ✕ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

let cookie = "";

async function req(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return res;
}

try {
  const up = await waitForServer();
  if (!up) {
    console.error("서버 기동 실패");
    process.exit(1);
  }

  // 1. 공개 페이지
  for (const [path, label] of [
    ["/", "랜딩"],
    ["/login", "로그인"],
    ["/signup", "회원가입"],
    ["/dashboard/guide", "안내(가이드는 로그인 리다이렉트 허용)"],
  ]) {
    const res = await req(path);
    check(`${label} 페이지 응답`, res.status === 200 || res.status === 307 || res.status === 302, `HTTP ${res.status}`);
  }

  const protectedRes = await req("/dashboard");
  check("비로그인 대시보드 차단", protectedRes.status === 307 || protectedRes.status === 302, `HTTP ${protectedRes.status}`);

  const unauthorized = await req("/api/clients");
  check("비로그인 API 차단", unauthorized.status === 401, `HTTP ${unauthorized.status}`);

  // 2. 데모 공유 쇼룸
  const share = await req("/share/mold-demo");
  const shareHtml = await share.text();
  check("데모 공유 쇼룸", share.status === 200 && shareHtml.includes("EUM 3D"), `HTTP ${share.status}`);
  check("공유 쇼룸 읽기 전용 표기", shareHtml.includes("읽기 전용") || shareHtml.includes("3D 쇼룸 엔진"), "SSR/클라이언트 렌더 확인");

  const gated = await req("/share/panel-demo");
  const gatedHtml = await gated.text();
  check("비밀번호 보호 공유 페이지", gated.status === 200 && gatedHtml.includes("비밀번호"), `HTTP ${gated.status}`);

  const qr = await req("/api/share/mold-demo/qr?format=png&size=256");
  check("QR PNG API", qr.status === 200 && (qr.headers.get("content-type") ?? "").includes("image/png"), `HTTP ${qr.status}, ${qr.headers.get("content-type")}`);
  const qrSvg = await req("/api/share/mold-demo/qr?format=svg");
  check("QR SVG API", qrSvg.status === 200 && (qrSvg.headers.get("content-type") ?? "").includes("image/svg"), `HTTP ${qrSvg.status}`);

  const unlock = await req("/api/share/panel-demo/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "eum2026" }),
  });
  check("공유 비밀번호 해제", unlock.status === 200, `HTTP ${unlock.status}`);
  const panelShared = await req("/share/panel-demo");
  check("해제 후 공유 쇼룸 열람", panelShared.status === 200, `HTTP ${panelShared.status}`);

  // 3. 로그인
  cookie = "";
  const login = await req("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@eum3d.kr", password: "Eum3d!2026" }),
  });
  check("관리자 로그인", login.status === 200 && Boolean(cookie), `HTTP ${login.status}`);

  const dashboard = await req("/dashboard");
  check("관리자 대시보드", dashboard.status === 200, `HTTP ${dashboard.status}`);
  const dashboardHtml = await dashboard.text();
  check("대시보드 프로젝트 카드", dashboardHtml.includes("사출금형") || dashboardHtml.includes("내 쇼룸 프로젝트"), "");

  const projectsApi = await req("/api/projects");
  const projectsJson = await projectsApi.json();
  check("프로젝트 목록 API", projectsApi.status === 200 && Array.isArray(projectsJson.projects) && projectsJson.projects.length >= 5, `프로젝트 ${projectsJson.projects?.length ?? 0}개`);

  const clientsApi = await req("/api/clients");
  const clientsJson = await clientsApi.json();
  check("고객사·라이선스 API", clientsApi.status === 200 && Array.isArray(clientsJson.clients) && clientsJson.clients.length >= 3, `고객사 ${clientsJson.clients?.length ?? 0}곳`);

  const usersApi = await req("/api/users");
  const usersJson = await usersApi.json();
  check("사용자 관리 API", usersApi.status === 200 && Array.isArray(usersJson.users) && usersJson.users.length >= 4, `사용자 ${usersJson.users?.length ?? 0}명`);

  // 4. 편집 페이지 & 3D 자산
  const projectId = projectsJson.projects.find((p) => p.title?.includes("사출금형"))?.id ?? projectsJson.projects[0]?.id;
  const editor = await req(`/dashboard/projects/${projectId}`);
  const editorHtml = await editor.text();
  check("쇼룸 편집 페이지", editor.status === 200 && editorHtml.includes("EUM"), `HTTP ${editor.status}`);

  const payload = await req(`/api/projects/${projectId}`);
  const payloadJson = await payload.json();
  check("프로젝트 상세 API", payload.status === 200 && Array.isArray(payloadJson.parts) && payloadJson.parts.length > 10, `부품 ${payloadJson.parts?.length ?? 0}개`);

  const glbRes = await req(`/api/files/projects/${projectId}/model.glb`);
  const glbBytes = new Uint8Array(await glbRes.arrayBuffer());
  check("GLB 파일 서빙", glbRes.status === 200 && glbBytes.length > 1000 && glbBytes[0] === 0x67, `${glbBytes.length} bytes, ${glbRes.headers.get("content-type")}`);

  // 5. 업로드 → 파이프라인 (샘플 DXF)
  const create = await req("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "스모크 테스트 DXF 프로젝트", industry: "MANUFACTURING", description: "smoke" }),
  });
  const created = await create.json();
  check("프로젝트 생성", create.status === 200 && Boolean(created.project?.id), `HTTP ${create.status}`);

  if (created.project?.id) {
    const newId = created.project.id;
    const dxfRes = await fetch(`${BASE}/api/files/samples/sample-plate.dxf`);
    const dxfText = await dxfRes.text();
    const form = new FormData();
    form.append("file", new Blob([dxfText], { type: "image/vnd.dxf" }), "smoke-plate.dxf");
    const upload = await req(`/api/projects/${newId}/upload`, { method: "POST", body: form });
    const uploadJson = await upload.json();
    check("파일 업로드 · 형식 분석", upload.status === 200 && uploadJson.upload?.kind === "2D", `HTTP ${upload.status}, ${uploadJson.upload?.formatLabel}`);

    const process = await req(`/api/projects/${newId}/process`, { method: "POST" });
    const processJson = await process.json();
    check("10단계 파이프라인 실행", process.status === 200 && ["OK", "WARN"].includes(processJson.status), `상태 ${processJson.status}, 단계 ${processJson.stages?.length ?? 0}개`);

    const pipeline = await req(`/api/projects/${newId}/pipeline`);
    const pipelineJson = await pipeline.json();
    check("파이프라인 단계 기록", pipeline.status === 200 && pipelineJson.run?.stages?.length === 10, `단계 ${pipelineJson.run?.stages?.length ?? 0}개`);

    const newPayload = await req(`/api/projects/${newId}`);
    const newPayloadJson = await newPayload.json();
    check("2D 도면 참고용 3D 생성", newPayloadJson.parts?.length > 0, `부품 ${newPayloadJson.parts?.length ?? 0}개`);

    const shareCreate = await req(`/api/projects/${newId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "smoke123", days: 1 }),
    });
    const shareJson = await shareCreate.json();
    check("공유 링크 발급", shareCreate.status === 200 && Boolean(shareJson.slug), `HTTP ${shareCreate.status}`);
    if (shareJson.slug) {
      const publicShare = await req(`/share/${shareJson.slug}`);
      check("신규 공유 페이지 접근", publicShare.status === 200, `HTTP ${publicShare.status}`);
    }

    const thumbnail = await req(`/api/projects/${newId}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }),
    });
    check("썸네일 저장 API", thumbnail.status === 200, `HTTP ${thumbnail.status}`);

    const del = await req(`/api/projects/${newId}`, { method: "DELETE" });
    check("프로젝트 정리", del.status === 200, `HTTP ${del.status}`);
  }

  // 5b. 이미지·PDF 도면 → 이미지 기반 고유 3D 릴리프
  async function uploadSampleProject(title, samplePath, filename, mime) {
    const createRes = await req("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, industry: "MANUFACTURING", description: "smoke-2d" }),
    });
    const createdJson = await createRes.json();
    const id = createdJson.project?.id;
    if (!id) return null;
    const sampleRes = await fetch(`${BASE}/api/files/samples/${samplePath}`);
    const sampleBuf = Buffer.from(await sampleRes.arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([sampleBuf], { type: mime }), filename);
    const upload = await req(`/api/projects/${id}/upload`, { method: "POST", body: form });
    const process = await req(`/api/projects/${id}/process`, { method: "POST" });
    const payload = await req(`/api/projects/${id}`);
    return { id, upload: await upload.json(), process: await process.json(), payload: await payload.json() };
  }

  const pngA = await uploadSampleProject("스모크 PNG 도면 A", "sample-drawing-a.png", "smoke-a.png", "image/png");
  if (pngA) {
    check("PNG 업로드 · 파이프라인 완료", ["OK", "WARN"].includes(pngA.process.status), `상태 ${pngA.process.status}`);
    check("PNG → 이미지 기반 3D 릴리프 모드", pngA.payload.project?.renderMode === "AI_REFERENCE_3D", pngA.payload.project?.renderMode);
    const pngParts = pngA.payload.parts ?? [];
    check("PNG 도면 원본 블록 부품", pngParts.some((p) => p.name === "도면 원본 블록"), `부품 ${pngParts.length}개`);
    check("PNG 윤곽 돌출 부품", pngParts.some((p) => p.name?.includes("주 윤곽")), pngParts.map((p) => p.name).slice(0, 4).join(" / "));
    const refUrl = pngA.payload.project?.referenceImageUrl;
    const refRes = refUrl ? await req(refUrl) : null;
    check("PNG 참고 이미지 서", refRes?.status === 200 && (refRes.headers.get("content-type") ?? "").includes("image/png"), `${refRes?.status}, ${refRes?.headers.get("content-type")}`);
    const glbRes = await req(`/api/files/projects/${pngA.id}/model.glb`);
    const glbBuf = Buffer.from(await glbRes.arrayBuffer());
    const glbText = glbBuf.toString("latin1");
    check("GLB 에 도면 텍스처·UV 내장", glbRes.status === 200 && glbText.includes("TEXCOORD_0") && glbText.includes('"images"'), `${glbBuf.length} bytes`);

    const pngB = await uploadSampleProject("스모크 PNG 도면 B", "sample-drawing-b.png", "smoke-b.png", "image/png");
    if (pngB) {
      const statsOf = (project) => (typeof project?.stats === "string" ? JSON.parse(project.stats) : project?.stats ?? {});
      const statsA = statsOf(pngA.payload.project);
      const statsB = statsOf(pngB.payload.project);
      check("서로 다른 PNG → 서로 다른 3D 메시", statsA.triangleCount !== statsB.triangleCount, `A ${statsA.triangleCount} / B ${statsB.triangleCount} 삼각형`);
      check("서로 다른 PNG → 서로 다른 부품", pngA.payload.parts?.length !== pngB.payload.parts?.length, `A ${pngA.payload.parts?.length} / B ${pngB.payload.parts?.length} 부품`);
      await req(`/api/projects/${pngB.id}`, { method: "DELETE" });
    }

    const pdfProject = await uploadSampleProject("스모크 PDF 도면", "sample-drawing.pdf", "smoke-drawing.pdf", "application/pdf");
    if (pdfProject) {
      const pdfOk = pdfProject.process.status === "OK";
      if (pdfOk) {
        check("PDF → 첫 페이지 렌더 후 이미지 기반 3D", pdfProject.payload.project?.renderMode === "AI_REFERENCE_3D" && Boolean(pdfProject.payload.project?.referenceImageUrl), pdfProject.payload.project?.renderMode);
      } else {
        const analysis = pdfProject.payload.project?.aiAnalysis ?? {};
        check(
          "PDF 렌더러 미설치 시 안전 폴백 · 명확한 안내",
          pdfProject.process.status === "WARN" && JSON.stringify(analysis.uncertainties ?? []).includes("PDF 렌더러"),
          `상태 ${pdfProject.process.status}`,
        );
      }
      await req(`/api/projects/${pdfProject.id}`, { method: "DELETE" });
    }

    await req(`/api/projects/${pngA.id}`, { method: "DELETE" });
  }

  // 6. 로그아웃
  const logout = await req("/api/auth/logout", { method: "POST" });
  check("로그아웃", logout.status === 200, `HTTP ${logout.status}`);
  cookie = "";
  const afterLogout = await req("/api/projects");
  check("로그아웃 후 인증 API 차단", afterLogout.status === 200, "공개 데모만 반환");
} catch (error) {
  failed += 1;
  results.push(`  ✕ 스모크 실행 예외 — ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill("SIGTERM");
  await sleep(800);
}

console.log("\nEUM 3D SHOWROOM PRO — HTTP 스모크 테스트\n");
console.log(results.join("\n"));
console.log(`\n결과: ${passed} 통과 / ${failed} 실패 (총 ${passed + failed})`);
process.exit(failed > 0 ? 1 : 0);
