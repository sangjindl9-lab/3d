import { describe, expect, it } from "vitest";
import { boxGeom, cylinderGeom, decodeGlb, encodeGlb, makeMesh, meshStats, optimizeMeshes, partBounds, segmentWall } from "@/lib/glb";

describe("GLB 인코딩/디코딩", () => {
  it("여러 부품을 하나의 GLB 로 저장하고 다시 읽는다", () => {
    const meshes = [
      makeMesh("BASE", [boxGeom([2, 0.2, 2], [0, 0.1, 0])], { color: [0.2, 0.3, 0.4] }),
      makeMesh("SHAFT", [cylinderGeom(0.1, 1.5, 24, [0, 0.9, 0])], { metalness: 1, roughness: 0.1 }),
    ];
    const glb = encodeGlb(meshes);
    expect(glb.subarray(0, 4).toString("latin1")).toBe("glTF");
    const decoded = decodeGlb(glb);
    expect(decoded.meshes.map((m) => m.name)).toEqual(["BASE", "SHAFT"]);
    const stats = meshStats(decoded.meshes);
    expect(stats.meshCount).toBe(2);
    expect(stats.vertexCount).toBeGreaterThan(0);
    expect(stats.triangleCount).toBeGreaterThan(0);
    expect(stats.size[0]).toBeGreaterThan(1.9);
  });

  it("메시 최적화가 중복 정점을 병합하고 퇴화 삼각형을 제거한다", () => {
    const base = makeMesh("DUP", [boxGeom([1, 1, 1])]);
    // 동일 정점을 중복 추가하고 퇴화 삼각형을 삽입
    const positions = new Float32Array([...base.positions, ...base.positions]);
    const normals = new Float32Array([...base.normals, ...base.normals]);
    const count = base.positions.length / 3;
    const indices = new Uint32Array([...base.indices, 0, 0, 1, ...base.indices.map((i) => i + count)]);
    const dirty = { ...base, positions, normals, indices };
    const { meshes, report } = optimizeMeshes([dirty]);
    expect(report.mergedVertices).toBeGreaterThan(0);
    expect(report.removedDegenerate).toBe(1);
    expect(report.afterVertices).toBeLessThan(report.beforeVertices);
    expect(meshes[0].indices.length).toBe(base.indices.length * 2);
    expect(report.afterTriangles).toBe(base.indices.length / 3 * 2);
  });

  it("부품 경계와 세그먼트 벽체를 계산한다", () => {
    const mesh = makeMesh("BOX", [boxGeom([1, 2, 3], [5, 6, 7])]);
    const bounds = partBounds(mesh);
    expect(bounds.center.map((v) => Math.round(v))).toEqual([5, 6, 7]);
    expect(bounds.size.map((v) => Math.round(v))).toEqual([1, 2, 3]);
    const wall = segmentWall(0, 0, 10, 0, 0.2, 1, 0);
    expect(wall.positions.length).toBeGreaterThan(0);
    expect(wall.indices.length).toBe(36);
  });

  it("GLB 가 아닌 데이터는 예외로 거부한다", () => {
    expect(() => decodeGlb(Buffer.from("not a glb"))).toThrow();
  });
});
