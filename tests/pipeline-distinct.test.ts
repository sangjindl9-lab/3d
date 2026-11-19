import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { buildShowroomPayload } from "@/lib/showroom-data";
import { attachUpload, makeClient, makeProject, makeUser, resetDb, sampleStl } from "./helpers";
import { initializeStorage } from "./utils";
import { decodeGlb, meshStats } from "@/lib/glb";
import { readStored } from "@/lib/storage";
import { buildThumbnailSvg } from "@/lib/storage";

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** 원점 기준 1×1×1 큐브와, 크기·위치가 다른 2×0.5×3 박스를 만든다. */
function scaledStl(scale: [number, number, number], offset: [number, number, number] = [0, 0, 0]): Buffer {
  const base = sampleStl().toString("latin1");
  const vertices = base.split("\n").filter((line) => line.trim().startsWith("vertex"));
  const lines = base.split("\n").map((line) => {
    const match = line.trim().match(/^vertex\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)$/);
    if (!match) return line;
    const coord = [Number(match[1]), Number(match[2]), Number(match[3])];
    return `      vertex ${(coord[0] * scale[0] + offset[0]).toFixed(4)} ${(coord[1] * scale[1] + offset[1]).toFixed(4)} ${(coord[2] * scale[2] + offset[2]).toFixed(4)}`;
  });
  expect(vertices.length).toBeGreaterThan(0);
  return Buffer.from(lines.join("\n"), "latin1");
}

async function uploadAndRun(filename: string, buffer: Buffer) {
  const client = await makeClient();
  const user = await makeUser(client.id);
  const project = await makeProject(client.id, user.id, { industry: "MOLD" });
  await attachUpload(project.id, filename, buffer);
  const outcome = await runPipeline(project.id);
  const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
  const model = await readStored(saved.modelPath!);
  return { project, outcome, saved, model };
}

describe("3D 모델·전체 파이프라인 재점검", () => {
  beforeEach(async () => {
    await resetDb();
    await initializeStorage();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("서로 다른 STL/OBJ/GLB 는 서로 다른 메시·부품·썸네일을 만든다", async () => {
    const stlA = await uploadAndRun("cube.stl", sampleStl());
    const stlB = await uploadAndRun("box.stl", scaledStl([2, 0.5, 3], [0.5, 0.25, 0.5]));
    const objBuffer = readFileSync(path.join(process.cwd(), "storage/samples/sample-housing.obj"));
    const obj = await uploadAndRun("housing.obj", objBuffer);

    expect(stlA.outcome.status).toBe("OK");
    expect(stlB.outcome.status).toBe("OK");
    expect(obj.outcome.status).toBe("OK");

    const statsA = meshStats(decodeGlb(stlA.model).meshes);
    const statsB = meshStats(decodeGlb(stlB.model).meshes);
    const statsObj = meshStats(decodeGlb(obj.model).meshes);
    expect(statsA.triangleCount).not.toBe(statsB.triangleCount / 2);
    expect(statsA.size.map((v) => Number(v.toFixed(3)))).not.toEqual(statsB.size.map((v) => Number(v.toFixed(3))));
    expect(statsObj.meshCount).not.toBe(statsA.meshCount);
    expect(hash(stlA.model)).not.toBe(hash(stlB.model));

    // GLB 를 다시 올리면 그 GLB 의 부품 구조가 그대로 재현된다
    const glbAgain = await uploadAndRun("copy.glb", stlA.model);
    expect(glbAgain.outcome.status).toBe("OK");
    const statsAgain = meshStats(decodeGlb(glbAgain.model).meshes);
    expect(statsAgain.meshCount).toBe(statsA.meshCount);

    // 썸네일도 파일마다 다르다
    const thumbs = await Promise.all(
      [stlA, stlB, obj].map(async (item) => hash(await readStored(item.saved.thumbnailPath!))),
    );
    expect(new Set(thumbs).size).toBe(3);
  });

  it("같은 프로젝트에 다른 파일을 다시 올리면 모델·참고 이미지 URL 이 갱신된다(캐시 무효화)", async () => {
    const client = await makeClient();
    const user = await makeUser(client.id);
    const project = await makeProject(client.id, user.id, { industry: "MANUFACTURING" });

    await attachUpload(project.id, "first.stl", sampleStl());
    await runPipeline(project.id);
    const first = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const firstModel = await readStored(first.modelPath!);
    const firstPayload = await buildShowroomPayload(project.id, { forShare: true });
    expect(firstPayload!.project.modelUrl).toMatch(/\?v=\d+$/);

    // 같은 프로젝트(model.glb 경로 동일)에 다른 도면을 다시 올린다
    await prisma.upload.deleteMany({ where: { projectId: project.id } });
    await attachUpload(project.id, "second.png", readFileSync(path.join(process.cwd(), "storage/samples/sample-drawing-b.png")));
    const secondOutcome = await runPipeline(project.id);
    expect(["OK", "WARN"]).toContain(secondOutcome.status);

    const second = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const secondModel = await readStored(second.modelPath!);
    expect(hash(firstModel)).not.toBe(hash(secondModel));
    expect(second.referenceImageUrl).toContain("/reference-page-1.png?v=");
    const secondPayload = await buildShowroomPayload(project.id, { forShare: true });
    expect(secondPayload!.project.modelUrl).not.toBe(firstPayload!.project.modelUrl);
    expect(secondPayload!.project.renderMode).toBe("AI_REFERENCE_3D");
    expect(secondPayload!.parts.some((p) => p.name === "도면 원본 블록")).toBe(true);
    // 같은 이름의 산출물을 서빙할 때 캐시를 재검증하도록 헤더가 설정되어 있다
    const filesRoute = readFileSync(path.join(process.cwd(), "src/app/api/files/[...path]/route.ts"), "utf8");
    expect(filesRoute).toContain("must-revalidate");
  });

  it("썸네일은 파일 지문을 포함해 같은 제목이라도 구분된다", () => {
    const base = { title: "테스트", industry: "제조", subtitle: "STL · 부품 3개", accent: "#38bdf8", lines: ["정점 100개"] };
    const a = buildThumbnailSvg({ ...base, fingerprint: "MESH|A|1000" });
    const b = buildThumbnailSvg({ ...base, fingerprint: "MESH|B|2000" });
    expect(a).not.toBe(b);
    const withPreview = buildThumbnailSvg({ ...base, fingerprint: "X", preview: "data:image/jpeg;base64,AAAA" });
    expect(withPreview).toContain("<image href=\"data:image/jpeg;base64,AAAA\"");
  });
});
