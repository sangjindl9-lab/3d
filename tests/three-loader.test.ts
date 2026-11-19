import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { boxGeom, cylinderGeom, encodeGlb, makeMesh } from "@/lib/glb";
import { allDemoModels, encodeDemoGlb } from "../prisma/seed-models";

async function parseWithThree(glb: Buffer) {
  const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
  return new Promise<Awaited<ReturnType<GLTFLoader["parseAsync"]>>>((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", (result) => resolve(result), reject);
  });
}

describe("Three.js 로더 호환성", () => {
  it("직접 생성한 GLB 를 Three.js GLTFLoader 가 읽고 노드 이름을 보존한다", async () => {
    const glb = encodeGlb([
      makeMesh("BASE_PLATE", [boxGeom([1, 0.1, 1])]),
      makeMesh("GEAR_1", [cylinderGeom(0.2, 0.08, 24)]),
    ]);
    const gltf = await parseWithThree(glb);
    const names: string[] = [];
    gltf.scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) names.push(obj.name);
    });
    expect(names).toContain("BASE_PLATE");
    expect(names).toContain("GEAR_1");
    expect(gltf.scene.children.length).toBeGreaterThanOrEqual(2);
  });

  it("5개 데모 모델 GLB 가 모두 Three.js 로 로드된다", async () => {
    for (const model of allDemoModels()) {
      const gltf = await parseWithThree(encodeDemoGlb(model));
      let meshCount = 0;
      gltf.scene.traverse((obj) => {
        if ((obj as { isMesh?: boolean }).isMesh) meshCount += 1;
      });
      expect(meshCount, `${model.title} 메시 수`).toBe(model.meshes.length);
      const missing = model.parts.filter((part) => !gltf.scene.getObjectByName(part.nodeName));
      expect(missing.map((p) => p.nodeName), `${model.title} 미매칭 부품`).toEqual([]);
    }
  });
});
