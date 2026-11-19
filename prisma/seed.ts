import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { allDemoModels, demoModelStats, encodeDemoGlb, sampleFiles, type DemoModel } from "./seed-models";
import { buildDefaultSequences } from "../src/lib/sequences";
import { hashPassword } from "../src/lib/auth";
import { partBounds } from "../src/lib/glb";
import { partDirection } from "../src/lib/partMeta";
import { materialPreset } from "../src/lib/constants";
import { buildThumbnailSvg } from "../src/lib/storage";

const prisma = new PrismaClient();
const STORAGE = path.join(process.cwd(), "storage");

const PART_COLORS: Record<string, string> = {
  STEEL: "#aeb8c4",
  STAINLESS: "#c7ced6",
  ALUMINUM: "#cdd5dd",
  BRASS: "#c9a227",
  PLASTIC: "#2f6f8f",
  GLASS: "#a8d8e8",
  PAINT: "#b9c0c7",
  COPPER: "#b87333",
};

async function writeProjectFiles(projectId: string, model: DemoModel): Promise<{ modelPath: string; thumbnailPath: string; stats: ReturnType<typeof demoModelStats> }> {
  const dir = path.join(STORAGE, "projects", projectId);
  await fs.mkdir(dir, { recursive: true });
  const glb = encodeDemoGlb(model);
  await fs.writeFile(path.join(dir, "model.glb"), glb);
  const stats = demoModelStats(model);
  const svg = buildThumbnailSvg({
    title: model.title,
    industry: model.industry,
    subtitle: `${model.parts.length}개 부품 · ${stats.triangleCount.toLocaleString()} 삼각형`,
    accent: model.renderMode === "MESH_3D" ? "#38bdf8" : "#f59e0b",
    badge: model.renderMode === "MESH_3D" ? "3D SHOWROOM" : "참고용 AI 3D",
  });
  await fs.writeFile(path.join(dir, "thumbnail.svg"), svg);
  return { modelPath: `projects/${projectId}/model.glb`, thumbnailPath: `projects/${projectId}/thumbnail.svg`, stats };
}

async function seedDemo(args: {
  model: DemoModel;
  clientId: string;
  ownerId: string;
  shareSlug: string;
  sharePassword?: string;
  shareExpiresDays?: number;
}): Promise<string> {
  const { model } = args;
  const project = await prisma.project.create({
    data: {
      title: model.title,
      description: model.description,
      industry: model.industry,
      template: model.template,
      background: model.background,
      status: "READY",
      sourceType: model.renderMode === "MESH_3D" ? "3D" : "2D",
      renderMode: model.renderMode,
      isAiReference: model.isAiReference,
      aiMode: model.aiMode,
      aiAnalysis: JSON.stringify(model.aiAnalysis ?? {}),
      isDemo: true,
      isPublicDemo: true,
      clientId: args.clientId,
      ownerId: args.ownerId,
    },
  });

  const files = await writeProjectFiles(project.id, model);
  const centers = model.meshes.map((m) => partBounds(m).center);
  const assemblyCenter: [number, number, number] = [
    (Math.min(...centers.map((c) => c[0])) + Math.max(...centers.map((c) => c[0]))) / 2,
    (Math.min(...centers.map((c) => c[1])) + Math.max(...centers.map((c) => c[1]))) / 2,
    (Math.min(...centers.map((c) => c[2])) + Math.max(...centers.map((c) => c[2]))) / 2,
  ];

  for (let i = 0; i < model.parts.length; i++) {
    const meta = model.parts[i];
    const mesh = model.meshes.find((m) => m.name === meta.nodeName);
    if (!mesh) continue;
    const bounds = partBounds(mesh);
    const dir = partDirection(bounds.center, assemblyCenter);
    const preset = materialPreset(meta.material);
    await prisma.part.create({
      data: {
        projectId: project.id,
        nodeName: meta.nodeName,
        name: meta.name,
        partNumber: `P-${String(i + 1).padStart(3, "0")}`,
        material: meta.material,
        spec: meta.spec ?? `${(bounds.size[0] * 1000).toFixed(0)} × ${(bounds.size[1] * 1000).toFixed(0)} × ${(bounds.size[2] * 1000).toFixed(0)} mm`,
        weight: meta.weight ?? Math.max(0.01, Math.round(bounds.size[0] * bounds.size[1] * bounds.size[2] * 7850 * 0.3 * 100) / 100),
        quantity: meta.quantity ?? 1,
        description: meta.description,
        color: PART_COLORS[meta.material] ?? preset.color,
        order: i,
        centerX: bounds.center[0],
        centerY: bounds.center[1],
        centerZ: bounds.center[2],
        sizeX: bounds.size[0],
        sizeY: bounds.size[1],
        sizeZ: bounds.size[2],
        explodedX: dir[0],
        explodedY: dir[1],
        explodedZ: dir[2],
        explodedDistance: 0.6,
        isMoldPart: model.industry === "MOLD",
        moldRole: meta.moldRole ?? null,
        motionGroup: meta.motionGroup ?? null,
      },
    });
  }

  const sequences = buildDefaultSequences({
    industry: model.industry,
    parts: model.parts.map((p) => ({ nodeName: p.nodeName, name: p.name })),
    sceneSize: Math.max(demoModelStats(model).size[0], demoModelStats(model).size[1], demoModelStats(model).size[2]),
  });
  for (const seq of sequences) {
    await prisma.animationSequence.create({
      data: { projectId: project.id, name: seq.name, kind: seq.kind, durationMs: seq.durationMs, steps: JSON.stringify(seq.steps) },
    });
  }

  for (const cam of model.cameras) {
    await prisma.cameraPreset.create({
      data: {
        projectId: project.id,
        name: cam.name,
        positionX: cam.position[0],
        positionY: cam.position[1],
        positionZ: cam.position[2],
        targetX: cam.target[0],
        targetY: cam.target[1],
        targetZ: cam.target[2],
        isDefault: cam === model.cameras[0],
      },
    });
  }

  for (const ann of model.annotations) {
    await prisma.annotation.create({
      data: {
        projectId: project.id,
        title: ann.title,
        body: ann.body,
        x: ann.x,
        y: ann.y,
        z: ann.z,
        authorName: "이음 3D 쇼룸",
      },
    });
  }

  await prisma.shareLink.create({
    data: {
      projectId: project.id,
      slug: args.shareSlug,
      passwordHash: args.sharePassword ? hashPassword(args.sharePassword) : null,
      expiresAt: args.shareExpiresDays ? new Date(Date.now() + args.shareExpiresDays * 86400000) : null,
      isActive: true,
      allowDownload: true,
      viewCount: Math.floor(Math.random() * 40) + 3,
    },
  });

  await prisma.upload.create({
    data: {
      projectId: project.id,
      originalName: `${model.key}-demo.glb`,
      storedPath: files.modelPath,
      size: Math.round(files.stats.triangleCount * 90),
      sha256: "demo-seed",
      detectedFormat: "GLB",
      declaredExt: "glb",
      kind: "3D",
      integrity: "OK",
      meta: JSON.stringify({ seeded: true }),
    },
  });

  await prisma.pipelineRun.create({
    data: {
      projectId: project.id,
      status: "OK",
      finishedAt: new Date(),
      stages: {
        create: [
          "파일 업로드",
          "형식 및 무결성 검사",
          "2D/3D 자동 판별",
          "부품 구조·계층 분석",
          "모델 변환",
          "웹 표시용 GLB 생성",
          "메시 최적화",
          "썸네일 생성",
          "쇼룸 프로젝트 저장",
          "3D 뷰어 자동 실행",
        ].map((label, i) => ({ step: i + 1, key: `SEED_${i + 1}`, label, status: "OK", detail: "시드 데이터로 생성됨", finishedAt: new Date() })),
      },
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      modelPath: files.modelPath,
      modelFormat: "GLB",
      thumbnailPath: files.thumbnailPath,
      stats: JSON.stringify({
        meshCount: files.stats.meshCount,
        vertexCount: files.stats.vertexCount,
        triangleCount: files.stats.triangleCount,
        size: files.stats.size.map((v) => Math.round(v * 100) / 100),
        bbox: files.stats.bbox,
      }),
    },
  });

  return project.id;
}

async function main(): Promise<void> {
  console.log("▶ EUM 3D SHOWROOM PRO 시드 시작");

  await prisma.auditLog.deleteMany();
  await prisma.shareLink.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipelineRun.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.annotation.deleteMany();
  await prisma.cameraPreset.deleteMany();
  await prisma.animationSequence.deleteMany();
  await prisma.part.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();

  const ssClient = await prisma.client.create({
    data: {
      name: "(주)에스에스전력",
      slug: "ss-power",
      businessNo: "123-45-67890",
      contactEmail: "contact@sspower.co.kr",
      plan: "ENTERPRISE",
      expiresAt: new Date("2027-12-31T23:59:59+09:00"),
      maxProjects: 200,
      maxUsers: 100,
      features: JSON.stringify(["SHARE", "QR", "SNAPSHOT", "EXPLODE", "XRAY", "ANNOTATION", "VIDEO", "MOLD_ANIM", "MACHINE_ANIM", "WHITELABEL", "API"]),
      primaryColor: "#22d3ee",
      accentColor: "#38bdf8",
      slogan: "전력 설비의 모든 것을 3D 로",
      headerText: "에스에스전력 디지털 쇼룸",
      footerText: "© 2026 SS Power Co., Ltd. 무단 전재 금지",
    },
  });

  const hbClient = await prisma.client.create({
    data: {
      name: "한빛정밀금형",
      slug: "hanbit-mold",
      businessNo: "234-56-78901",
      contactEmail: "sales@hanbitmold.co.kr",
      plan: "PROFESSIONAL",
      expiresAt: new Date("2027-06-30T23:59:59+09:00"),
      maxProjects: 30,
      maxUsers: 15,
      features: JSON.stringify(["SHARE", "QR", "SNAPSHOT", "EXPLODE", "XRAY", "ANNOTATION", "VIDEO", "MOLD_ANIM", "MACHINE_ANIM", "WHITELABEL"]),
      primaryColor: "#f59e0b",
      accentColor: "#fbbf24",
      slogan: "정밀금형 기술을 눈으로 확인하세요",
      headerText: "한빛정밀금형 기술 쇼룸",
      footerText: "© 2026 Hanbit Precision Mold. All rights reserved.",
    },
  });

  const expiredClient = await prisma.client.create({
    data: {
      name: "대한산업기계 (체험 종료)",
      slug: "daehan-expired",
      contactEmail: "expired@example.com",
      plan: "STARTER",
      expiresAt: new Date("2025-12-31T23:59:59+09:00"),
      maxProjects: 5,
      maxUsers: 3,
      features: JSON.stringify(["SHARE", "SNAPSHOT"]),
      primaryColor: "#94a3b8",
      accentColor: "#cbd5e1",
      slogan: "라이선스 만료 예시 고객사",
    },
  });

  const adminPassword = hashPassword("Eum3d!2026");
  const admin = await prisma.user.create({
    data: { email: "admin@eum3d.kr", passwordHash: adminPassword, name: "이음 관리자", role: "ADMIN" },
  });
  const ssAdmin = await prisma.user.create({
    data: { email: "ss@eum3d.kr", passwordHash: hashPassword("SsPower!2026"), name: "에스에스전력 담당자", role: "CLIENT_ADMIN", clientId: ssClient.id },
  });
  const hbAdmin = await prisma.user.create({
    data: { email: "hb@eum3d.kr", passwordHash: hashPassword("Hanbit!2026"), name: "한빛정밀금형 담당자", role: "CLIENT_ADMIN", clientId: hbClient.id },
  });
  await prisma.user.create({
    data: { email: "user@eum3d.kr", passwordHash: hashPassword("User!2026"), name: "에스에스전력 영업팀", role: "USER", clientId: ssClient.id },
  });
  await prisma.user.create({
    data: { email: "expired@eum3d.kr", passwordHash: hashPassword("Expired!2026"), name: "대한산업기계 담당자", role: "CLIENT_ADMIN", clientId: expiredClient.id },
  });

  const models = allDemoModels();
  const plan: { model: DemoModel; clientId: string; ownerId: string; slug: string; password?: string; days?: number }[] = [
    { model: models[0], clientId: hbClient.id, ownerId: hbAdmin.id, slug: "mold-demo" },
    { model: models[1], clientId: ssClient.id, ownerId: ssAdmin.id, slug: "gearbox-demo" },
    { model: models[2], clientId: ssClient.id, ownerId: ssAdmin.id, slug: "panel-demo", password: "eum2026" },
    { model: models[3], clientId: ssClient.id, ownerId: ssAdmin.id, slug: "plant-demo", days: 30 },
    { model: models[4], clientId: hbClient.id, ownerId: hbAdmin.id, slug: "drawing-demo" },
  ];

  for (const item of plan) {
    const id = await seedDemo({
      model: item.model,
      clientId: item.clientId,
      ownerId: item.ownerId,
      shareSlug: item.slug,
      sharePassword: item.password,
      shareExpiresDays: item.days,
    });
    console.log(`  · ${item.model.title} → ${id} (/share/${item.slug}${item.password ? `, 비밀번호 ${item.password}` : ""})`);
  }

  const samplesDir = path.join(STORAGE, "samples");
  await fs.mkdir(samplesDir, { recursive: true });
  for (const file of sampleFiles()) {
    await fs.writeFile(path.join(samplesDir, file.name), file.content);
  }

  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "SEED_DEMO", detail: JSON.stringify({ projects: plan.length, clients: 3 }) },
  });

  console.log("\n▶ 시드 완료");
  console.log("  관리자: admin@eum3d.kr / Eum3d!2026");
  console.log("  고객사 관리자: ss@eum3d.kr / SsPower!2026, hb@eum3d.kr / Hanbit!2026");
  console.log("  일반 사용자: user@eum3d.kr / User!2026");
  console.log("  공유 데모: /share/mold-demo, /share/gearbox-demo, /share/panel-demo (비밀번호 eum2026), /share/plant-demo, /share/drawing-demo");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
