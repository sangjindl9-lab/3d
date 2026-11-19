import { computeNormals, partBounds, type MeshData } from "../glb";

/** STL(바이너리/ASCII) 파서 + 연결 요소 기반 부품 분리 */
export function parseStl(buffer: Buffer): { meshes: MeshData[]; meta: Record<string, unknown> } {
  type Tri = [number[], number[], number[]];
  const triangles: Tri[] = [];
  let ascii = false;
  if (buffer.length >= 84) {
    const count = buffer.readUInt32LE(80);
    if (count > 0 && 84 + count * 50 === buffer.length) {
      for (let i = 0; i < count; i++) {
        const off = 84 + i * 50;
        const a = [buffer.readFloatLE(off + 12), buffer.readFloatLE(off + 16), buffer.readFloatLE(off + 20)];
        const b = [buffer.readFloatLE(off + 24), buffer.readFloatLE(off + 28), buffer.readFloatLE(off + 32)];
        const c = [buffer.readFloatLE(off + 36), buffer.readFloatLE(off + 40), buffer.readFloatLE(off + 44)];
        triangles.push([a, b, c]);
      }
    }
  }
  if (triangles.length === 0) {
    ascii = true;
    const text = buffer.toString("utf8");
    const vertexRe = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    let current: number[][] = [];
    let m: RegExpExecArray | null;
    while ((m = vertexRe.exec(text)) !== null) {
      current.push([Number(m[1]), Number(m[2]), Number(m[3])]);
      if (current.length === 3) {
        triangles.push([current[0], current[1], current[2]]);
        current = [];
      }
    }
  }
  if (triangles.length === 0) throw new Error("STL 에서 삼각형을 찾지 못했습니다.");

  // 연결 요소(정점 공유) 기반 부품 그룹
  const maxTriangles = 120000;
  const limit = Math.min(triangles.length, maxTriangles);
  const keyOf = (v: number[]) => `${v[0].toFixed(4)}|${v[1].toFixed(4)}|${v[2].toFixed(4)}`;
  const parent: number[] = [];
  for (let i = 0; i < limit * 3; i++) parent.push(i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const firstVertex = new Map<string, number>();
  for (let t = 0; t < limit; t++) {
    const tri = triangles[t];
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
      const key = keyOf(tri[k]);
      const existing = firstVertex.get(key);
      const id = existing !== undefined ? existing : t * 3 + k;
      if (existing === undefined) firstVertex.set(key, id);
      ids.push(id);
    }
    union(ids[0], ids[1]);
    union(ids[1], ids[2]);
  }

  const groups = new Map<number, number[]>();
  for (let t = 0; t < limit; t++) {
    const root = find(t * 3);
    const list = groups.get(root) ?? [];
    list.push(t);
    groups.set(root, list);
  }

  const groupList = Array.from(groups.values()).sort((a, b) => b.length - a.length);
  const merged: number[][] = [];
  const maxParts = 40;
  const parts: Tri[][] = [];
  for (let i = 0; i < groupList.length; i++) {
    if (i < maxParts - 1 || groupList.length <= maxParts) {
      parts.push(groupList[i].map((t) => triangles[t]));
    } else {
      // 너무 잘게 쪼개진 경우 나머지는 하나로
      if (merged.length === 0) parts.push([]);
      const last = parts[parts.length - 1];
      for (const t of groupList[i]) last.push(triangles[t]);
      merged.push(groupList[i]);
    }
  }

  const meshes: MeshData[] = parts
    .filter((p) => p.length > 0)
    .map((tris, idx) => {
      const positions: number[] = [];
      const indices: number[] = [];
      for (const tri of tris) {
        const base = positions.length / 3;
        for (const v of tri) positions.push(v[0], v[1], v[2]);
        indices.push(base, base + 1, base + 2);
      }
      const positionsArr = new Float32Array(positions);
      const indicesArr = new Uint32Array(indices);
      return {
        name: `STL 부품 ${idx + 1}`,
        positions: positionsArr,
        normals: computeNormals(positionsArr, indicesArr),
        indices: indicesArr,
        color: [0.62, 0.67, 0.73],
        metalness: 0.75,
        roughness: 0.4,
      };
    });

  const total = meshes.reduce((acc, m) => acc + m.positions.length / 3, 0);
  return {
    meshes,
    meta: {
      encoding: ascii ? "ascii" : "binary",
      triangleCount: triangles.length,
      partCount: meshes.length,
      vertexCount: total,
      componentSplit: true,
      bounds: meshes.map((m) => partBounds(m)),
    },
  };
}
