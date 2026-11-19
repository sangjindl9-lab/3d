import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { analyzeFile } from "@/lib/formats";
import { saveProjectSource } from "@/lib/storage";
import { PLAN_PRESETS } from "@/lib/constants";

export async function resetDb(): Promise<void> {
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
}

export async function makeClient(overrides: Partial<{ plan: string; expiresAt: Date; maxProjects: number; maxUsers: number; features: string[]; name: string; slug: string }> = {}) {
  const plan = overrides.plan ?? "PROFESSIONAL";
  const preset = PLAN_PRESETS[plan] ?? PLAN_PRESETS.PROFESSIONAL;
  const suffix = Math.random().toString(36).slice(2, 8);
  return prisma.client.create({
    data: {
      name: overrides.name ?? "테스트 고객사",
      slug: overrides.slug ?? `test-client-${suffix}`,
      plan,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 86400000),
      maxProjects: overrides.maxProjects ?? preset.maxProjects,
      maxUsers: overrides.maxUsers ?? preset.maxUsers,
      features: JSON.stringify(overrides.features ?? preset.features),
      primaryColor: "#22d3ee",
      accentColor: "#38bdf8",
      slogan: "테스트 슬로건",
      headerText: "테스트 헤더",
      footerText: "테스트 푸터",
    },
  });
}

export async function makeUser(clientId: string | null, role = "CLIENT_ADMIN") {
  const suffix = Math.random().toString(36).slice(2, 8);
  return prisma.user.create({
    data: {
      email: `user-${suffix}@test.local`,
      name: `테스트 사용자 ${suffix}`,
      passwordHash: hashPassword("Test!1234"),
      role,
      clientId,
    },
  });
}

export async function makeProject(clientId: string, ownerId: string, overrides: Partial<{ title: string; status: string; industry: string; isDemo: boolean }> = {}) {
  return prisma.project.create({
    data: {
      title: overrides.title ?? "파이프라인 테스트 프로젝트",
      description: "테스트",
      industry: overrides.industry ?? "MOLD",
      template: "MOLD_TECH",
      background: "STUDIO",
      status: overrides.status ?? "DRAFT",
      ownerId,
      clientId,
      isDemo: overrides.isDemo ?? false,
    },
  });
}

/** 파일 버퍼를 실제 업로드처럼 저장하고 Upload 행을 만든다. */
export async function attachUpload(projectId: string, filename: string, buffer: Buffer) {
  const analysis = analyzeFile(buffer, filename);
  const storedPath = await saveProjectSource(projectId, filename, buffer);
  return prisma.upload.create({
    data: {
      projectId,
      originalName: filename,
      storedPath,
      size: analysis.size,
      sha256: analysis.sha256,
      detectedFormat: analysis.formatId,
      declaredExt: analysis.declaredExt,
      kind: analysis.kind,
      integrity: analysis.integrity,
      meta: JSON.stringify(analysis.meta),
    },
  });
}

export function sampleDxf(): Buffer {
  return Buffer.from(`0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
OUTLINE
0
LAYER
2
HOLES
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
OUTLINE
90
4
70
1
10
10
20
10
10
210
20
10
10
210
20
110
10
10
20
110
0
CIRCLE
8
HOLES
10
60
20
60
40
12
0
CIRCLE
8
HOLES
10
160
20
60
40
12
0
TEXT
8
OUTLINE
1
REFERENCE BRACKET
10
20
20
105
40
5
0
ENDSEC
0
EOF
`, "latin1");
}

export function sampleStl(): Buffer {
  const triangles: string[] = [];
  const cube: [number, number, number][][] = [
    [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
    [[0, 0, 0], [1, 1, 0], [0, 1, 0]],
    [[0, 0, 1], [1, 1, 1], [1, 0, 1]],
    [[0, 0, 1], [0, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 1], [1, 0, 1]],
    [[0, 0, 0], [1, 0, 1], [1, 0, 0]],
    [[0, 1, 0], [1, 1, 0], [1, 1, 1]],
    [[0, 1, 0], [1, 1, 1], [0, 1, 1]],
    [[1, 0, 0], [1, 1, 1], [1, 1, 0]],
    [[1, 0, 0], [1, 0, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 1, 0], [0, 1, 1]],
    [[0, 0, 0], [0, 1, 1], [0, 0, 1]],
  ];
  for (const tri of cube) {
    triangles.push("facet normal 0 0 0\nouter loop\n" + tri.map((v) => `vertex ${v[0]} ${v[1]} ${v[2]}`).join("\n") + "\nendloop\nendfacet");
  }
  return Buffer.from(`solid test\n${triangles.join("\n")}\nendsolid test\n`, "utf8");
}
