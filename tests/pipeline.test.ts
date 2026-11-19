import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { initializeStorage } from "./utils";
import { attachUpload, makeClient, makeProject, makeUser, resetDb, sampleDxf, sampleStl } from "./helpers";
import { decodeGlb } from "@/lib/glb";
import { readStored } from "@/lib/storage";

async function setup(filename: string, buffer: Buffer, industry = "MOLD") {
  const client = await makeClient();
  const user = await makeUser(client.id);
  const project = await makeProject(client.id, user.id, { industry });
  await attachUpload(project.id, filename, buffer);
  return { client, user, project };
}

describe("10단계 변환 파이프라인", () => {
  beforeEach(async () => {
    await resetDb();
    await initializeStorage();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("STL 업로드 → GLB 생성 → 부품/시퀀스 저장까지 10단계 완료", async () => {
    const { project } = await setup("bracket.stl", sampleStl());
    const outcome = await runPipeline(project.id);
    expect(outcome.stages).toHaveLength(10);
    expect(outcome.status).toBe("OK");
    expect(outcome.stages.map((s) => s.status)).toEqual(Array(10).fill("OK"));

    const saved = await prisma.project.findUnique({ where: { id: project.id } });
    expect(saved?.status).toBe("READY");
    expect(saved?.modelPath).toBeTruthy();
    expect(saved?.sourceType).toBe("3D");
    const glb = decodeGlb(await readStored(saved!.modelPath!));
    expect(glb.meshes.length).toBeGreaterThan(0);

    const parts = await prisma.part.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0].partNumber).toBe("P-001");
    expect(parts[0].weight).toBeGreaterThan(0);
    const sequences = await prisma.animationSequence.findMany({ where: { projectId: project.id } });
    expect(sequences.map((s) => s.kind)).toEqual(expect.arrayContaining(["ASSEMBLY", "TURNTABLE"]));
    const preset = await prisma.cameraPreset.count({ where: { projectId: project.id } });
    expect(preset).toBeGreaterThan(0);
  });

  it("금형 업종은 금형 개폐 시퀀스가 추가된다", async () => {
    const { project } = await setup("mold.stl", sampleStl(), "MOLD");
    await runPipeline(project.id);
    const sequences = await prisma.animationSequence.findMany({ where: { projectId: project.id } });
    expect(sequences.some((s) => s.kind === "MOLD")).toBe(true);
    const moldSteps = JSON.parse(sequences.find((s) => s.kind === "MOLD")!.steps);
    expect(moldSteps.length).toBeGreaterThanOrEqual(4);
  });

  it("2D DXF 는 참고용 AI 3D 시각화 플래그와 불확실성 고지를 저장한다", async () => {
    const { project } = await setup("bracket.dxf", sampleDxf(), "MANUFACTURING");
    const outcome = await runPipeline(project.id);
    expect(outcome.status).toBe("OK");
    const saved = await prisma.project.findUnique({ where: { id: project.id } });
    expect(saved?.sourceType).toBe("2D");
    expect(saved?.isAiReference).toBe(true);
    expect(saved?.renderMode).toBe("AI_REFERENCE_3D");
    expect(saved?.aiMode).toBe("HEURISTIC_RULES");
    const analysis = JSON.parse(saved!.aiAnalysis);
    expect(analysis.uncertainties.length).toBeGreaterThan(0);
    expect(analysis.note).toContain("참고용");
    const parts = await prisma.part.findMany({ where: { projectId: project.id } });
    expect(parts.some((p) => p.name.includes("OUTLINE"))).toBe(true);
    expect(parts.some((p) => p.name.includes("HOLES"))).toBe(true);
    expect(saved?.modelPath).toBeTruthy();
  });

  it("STEP 은 변환된 것처럼 꾸미지 않고 외부 변환기 필요 상태로 저장한다", async () => {
    const step = Buffer.from(
      "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n#1=PRODUCT('SAMPLE SHAFT','SAMPLE SHAFT','',());\nENDSEC;\nEND-ISO-10303-21;\n",
    );
    const { project } = await setup("shaft.step", step, "MACHINE");
    const outcome = await runPipeline(project.id);
    expect(outcome.status).toBe("WARN");
    const convert = outcome.stages.find((s) => s.key === "CONVERT");
    expect(convert?.status).toBe("WARN");
    expect(convert?.detail).toContain("외부 CAD 변환기");
    const saved = await prisma.project.findUnique({ where: { id: project.id } });
    expect(saved?.status).toBe("CONVERT_REQUIRED");
    expect(saved?.modelPath).toBeNull();
    const parts = await prisma.part.count({ where: { projectId: project.id } });
    expect(parts).toBe(0);
  });

  it("업로드가 없으면 1단계에서 실패하고 이후 단계를 건너뛴다", async () => {
    const client = await makeClient();
    const user = await makeUser(client.id);
    const project = await makeProject(client.id, user.id);
    const outcome = await runPipeline(project.id);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.stages[0].status).toBe("FAILED");
    const saved = await prisma.project.findUnique({ where: { id: project.id } });
    expect(saved?.status).toBe("FAILED");
  });
});
