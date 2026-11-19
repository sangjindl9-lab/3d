import { computeNormals, type MeshData } from "../glb";

type ObjGroup = { name: string; positions: number[]; normals: number[]; indices: number[]; material?: string };

/** OBJ(Wavefront) 파서 — o/g 그룹을 부품 계층으로 추출 */
export function parseObj(buffer: Buffer): { meshes: MeshData[]; meta: Record<string, unknown> } {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  const vertices: [number, number, number][] = [];
  const normalsSrc: [number, number, number][] = [];
  const groups = new Map<string, ObjGroup>();
  let current = "기본 부품";
  let material: string | undefined;
  let faces = 0;
  const materials = new Set<string>();
  const ensure = (name: string): ObjGroup => {
    let g = groups.get(name);
    if (!g) {
      g = { name, positions: [], normals: [], indices: [] };
      groups.set(name, g);
    }
    if (material) g.material = material;
    return g;
  };
  ensure(current);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === "v" && parts.length >= 4) {
      vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (tag === "vn" && parts.length >= 4) {
      normalsSrc.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (tag === "o" || tag === "g") {
      current = parts.slice(1).join(" ") || "기본 부품";
      ensure(current);
    } else if (tag === "usemtl") {
      material = parts.slice(1).join(" ") || undefined;
      if (material) materials.add(material);
      ensure(current);
      groups.get(current)!.material = material;
    } else if (tag === "f" && parts.length >= 4) {
      faces += 1;
      const g = ensure(current);
      const verts: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const token = parts[i].split("/");
        const vi = Number(token[0]);
        if (!Number.isFinite(vi) || vi === 0) continue;
        const idx = vi > 0 ? vi - 1 : vertices.length + vi;
        if (idx < 0 || idx >= vertices.length) continue;
        verts.push(idx);
      }
      if (verts.length < 3) continue;
      // fan triangulation
      for (let i = 1; i < verts.length - 1; i++) {
        const tri = [verts[0], verts[i], verts[i + 1]];
        const base = g.positions.length / 3;
        for (const vi of tri) {
          const v = vertices[vi];
          g.positions.push(v[0], v[1], v[2]);
          g.normals.push(0, 0, 0);
        }
        g.indices.push(base, base + 1, base + 2);
      }
    }
  }

  const palette: [number, number, number][] = [
    [0.6, 0.64, 0.7],
    [0.75, 0.55, 0.35],
    [0.35, 0.55, 0.7],
    [0.55, 0.7, 0.5],
    [0.7, 0.4, 0.45],
    [0.65, 0.65, 0.4],
  ];

  const meshes: MeshData[] = Array.from(groups.values())
    .filter((g) => g.indices.length > 0)
    .map((g, idx) => {
      const positions = new Float32Array(g.positions);
      const indices = new Uint32Array(g.indices);
      return {
        name: g.name || `부품 ${idx + 1}`,
        positions,
        normals: computeNormals(positions, indices),
        indices,
        color: palette[idx % palette.length],
        metalness: 0.55,
        roughness: 0.45,
      };
    });

  return {
    meshes,
    meta: {
      vertexCount: vertices.length,
      faceCount: faces,
      groupCount: meshes.length,
      materials: Array.from(materials),
      hadNormals: normalsSrc.length > 0,
    },
  };
}
