// GLB(glTF 2.0 바이너리) 생성·해석·최적화 및 절차적 형상 유틸리티.
// 외부 3D 라이브러리 없이 서버에서 직접 동작하도록 구현했다.

export type Rgb = [number, number, number];

export type MeshTexture = { data: Buffer; mimeType: string; name?: string };

export type MeshData = {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
  texture?: MeshTexture;
  color?: Rgb;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: Rgb;
  extras?: Record<string, unknown>;
};

export type GeomArrays = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; uvs?: Float32Array };

const COMPONENTS: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function align4(n: number): number {
  return (n + 3) & ~3;
}

export function emptyGeom(): GeomArrays {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
}

export function mergeGeoms(list: GeomArrays[]): GeomArrays {
  let vertexCount = 0;
  let indexCount = 0;
  let hasUv = false;
  for (const g of list) {
    vertexCount += g.positions.length / 3;
    indexCount += g.indices.length;
    if (g.uvs && g.uvs.length > 0) hasUv = true;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = hasUv ? new Float32Array(vertexCount * 2) : undefined;
  const indices = new Uint32Array(indexCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of list) {
    positions.set(g.positions, vOff);
    normals.set(g.normals, vOff);
    if (uvs && g.uvs) uvs.set(g.uvs, (vOff / 3) * 2);
    const base = vOff / 3;
    for (let i = 0; i < g.indices.length; i++) indices[iOff + i] = g.indices[i] + base;
    vOff += g.positions.length;
    iOff += g.indices.length;
  }
  return uvs ? { positions, normals, indices, uvs } : { positions, normals, indices };
}

export function makeMesh(name: string, geoms: GeomArrays[], material: Partial<MeshData> = {}): MeshData {
  const merged = mergeGeoms(geoms);
  return {
    name,
    positions: merged.positions,
    normals: merged.normals,
    indices: merged.indices,
    ...(merged.uvs ? { uvs: merged.uvs } : {}),
    ...(material.texture ? { texture: material.texture } : {}),
    color: material.color ?? [0.62, 0.66, 0.71],
    metalness: material.metalness ?? 0.85,
    roughness: material.roughness ?? 0.35,
    opacity: material.opacity ?? 1,
    emissive: material.emissive,
    extras: material.extras,
  };
}

type Vec3 = [number, number, number];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** 축 정렬 박스 */
export function boxGeom(size: Vec3, center: Vec3 = [0, 0, 0]): GeomArrays {
  const [sx, sy, sz] = size;
  const [cx, cy, cz] = center;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const p: Vec3[] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  const faces: { idx: [number, number, number, number]; n: Vec3 }[] = [
    { idx: [4, 5, 6, 7], n: [0, 0, 1] },
    { idx: [1, 0, 3, 2], n: [0, 0, -1] },
    { idx: [5, 1, 2, 6], n: [1, 0, 0] },
    { idx: [0, 4, 7, 3], n: [-1, 0, 0] },
    { idx: [7, 6, 2, 3], n: [0, 1, 0] },
    { idx: [0, 1, 5, 4], n: [0, -1, 0] },
  ];
  return quadFaces(p, faces);
}

function quadFaces(points: Vec3[], faces: { idx: [number, number, number, number]; n: Vec3 }[]): GeomArrays {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const i of face.idx) {
      const v = points[i];
      positions.push(v[0], v[1], v[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

/**
 * 정면(+Z) 면에 이미지가 정확히 1:1 로 매핑되는 직육면체.
 * 나머지 면은 이미지 가장자리 색을 샘플링하도록 UV 를 고정한다(테두리 늘어남 방지).
 */
export function texturedBoxGeom(size: Vec3, center: Vec3 = [0, 0, 0]): GeomArrays {
  const [sx, sy, sz] = size;
  const [cx, cy, cz] = center;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const p: Vec3[] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  // glTF UV 원점은 좌상단(v=0). 정면은 이미지 전체를 뒤집힘 없이 매핑한다.
  const frontUv = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  const edge = [0.02, 0.02] as [number, number];
  const faces: { idx: [number, number, number, number]; n: Vec3; uv: [number, number][] }[] = [
    { idx: [4, 5, 6, 7], n: [0, 0, 1], uv: frontUv as [number, number][] },
    { idx: [1, 0, 3, 2], n: [0, 0, -1], uv: [edge, edge, edge, edge] },
    { idx: [5, 1, 2, 6], n: [1, 0, 0], uv: [edge, edge, edge, edge] },
    { idx: [0, 4, 7, 3], n: [-1, 0, 0], uv: [edge, edge, edge, edge] },
    { idx: [7, 6, 2, 3], n: [0, 1, 0], uv: [edge, edge, edge, edge] },
    { idx: [0, 1, 5, 4], n: [0, -1, 0], uv: [edge, edge, edge, edge] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    face.idx.forEach((i, fi) => {
      const v = p[i];
      positions.push(v[0], v[1], v[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
      uvs.push(face.uv[fi][0], face.uv[fi][1]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    uvs: new Float32Array(uvs),
  };
}

/** 임의 방향 박스 (세그먼트 기반 3D 도면 relief 에 사용) */
export function orientedBox(center: Vec3, ax: Vec3, ay: Vec3, az: Vec3, half: Vec3): GeomArrays {
  const ux = norm(ax);
  const uy = norm(ay);
  const uz = norm(az);
  const [hx, hy, hz] = half;
  const corner = (sx: number, sy: number, sz: number): Vec3 => [
    center[0] + ux[0] * hx * sx + uy[0] * hy * sy + uz[0] * hz * sz,
    center[1] + ux[1] * hx * sx + uy[1] * hy * sy + uz[1] * hz * sz,
    center[2] + ux[2] * hx * sx + uy[2] * hy * sy + uz[2] * hz * sz,
  ];
  const points: Vec3[] = [
    corner(-1, -1, -1),
    corner(1, -1, -1),
    corner(1, 1, -1),
    corner(-1, 1, -1),
    corner(-1, -1, 1),
    corner(1, -1, 1),
    corner(1, 1, 1),
    corner(-1, 1, 1),
  ];
  return quadFaces(points, [
    { idx: [4, 5, 6, 7], n: uz },
    { idx: [1, 0, 3, 2], n: [-uz[0], -uz[1], -uz[2]] },
    { idx: [5, 1, 2, 6], n: ux },
    { idx: [0, 4, 7, 3], n: [-ux[0], -ux[1], -ux[2]] },
    { idx: [7, 6, 2, 3], n: uy },
    { idx: [0, 1, 5, 4], n: [-uy[0], -uy[1], -uy[2]] },
  ]);
}

/** 2D 선분을 두께·높이를 가진 3D 벽체로 */
export function segmentWall(x1: number, y1: number, x2: number, y2: number, thickness: number, height: number, z0 = 0): GeomArrays {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return emptyGeom();
  }
  const dir: Vec3 = [dx / len, dy / len, 0];
  const perp: Vec3 = [-dir[1], dir[0], 0];
  const center: Vec3 = [(x1 + x2) / 2, (y1 + y2) / 2, z0 + height / 2];
  return orientedBox(center, dir, perp, [0, 0, 1], [len / 2, thickness / 2, height / 2]);
}

/** 원기둥 (axis: 'x'|'y'|'z') */
export function cylinderGeom(radius: number, height: number, segments = 32, center: Vec3 = [0, 0, 0], axis: "x" | "y" | "z" = "y", radiusTop?: number): GeomArrays {
  const rt = radiusTop ?? radius;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = height / 2;
  const pushVec = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    let px = x;
    let py = y;
    let pz = z;
    let mx = nx;
    let my = ny;
    let mz = nz;
    if (axis === "x") {
      px = z;
      py = x;
      pz = y;
      mx = nz;
      my = nx;
      mz = ny;
    } else if (axis === "z") {
      px = x;
      py = y;
      pz = z;
      mx = nx;
      my = ny;
      mz = nz;
    }
    positions.push(px + center[0], py + center[1], pz + center[2]);
    normals.push(mx, my, mz);
  };
  // 측면
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    if (axis === "y") {
      pushVec(radius * c, -half, radius * s, c, 0, s);
      pushVec(rt * c, half, rt * s, c, 0, s);
    } else if (axis === "x") {
      pushVec(-half, radius * c, radius * s, 0, c, s);
      pushVec(half, rt * c, rt * s, 0, c, s);
    } else {
      pushVec(radius * c, radius * s, -half, c, s, 0);
      pushVec(rt * c, rt * s, half, c, s, 0);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // 캡
  const capCenterBase = positions.length / 3;
  if (axis === "y") {
    positions.push(center[0], center[1] + half, center[2]);
    normals.push(0, 1, 0);
    const ringStart = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      positions.push(center[0] + rt * Math.cos(t), center[1] + half, center[2] + rt * Math.sin(t));
      normals.push(0, 1, 0);
    }
    for (let i = 0; i < segments; i++) indices.push(capCenterBase, ringStart + i, ringStart + i + 1);
  } else if (axis === "x") {
    positions.push(center[0] + half, center[1], center[2]);
    normals.push(1, 0, 0);
    const ringStart = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      positions.push(center[0] + half, center[1] + rt * Math.cos(t), center[2] + rt * Math.sin(t));
      normals.push(1, 0, 0);
    }
    for (let i = 0; i < segments; i++) indices.push(capCenterBase, ringStart + i + 1, ringStart + i);
  } else {
    positions.push(center[0], center[1], center[2] + half);
    normals.push(0, 0, 1);
    const ringStart = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      positions.push(center[0] + rt * Math.cos(t), center[1] + rt * Math.sin(t), center[2] + half);
      normals.push(0, 0, 1);
    }
    for (let i = 0; i < segments; i++) indices.push(capCenterBase, ringStart + i, ringStart + i + 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

/** 원환체 (베어링 링, 밸브 휠 등) */
export function torusGeom(radius: number, tube: number, center: Vec3 = [0, 0, 0], axis: "x" | "y" | "z" = "y"): GeomArrays {
  const radial = 18;
  const tubular = 40;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= radial; i++) {
    const u = (i / radial) * Math.PI * 2;
    for (let j = 0; j <= tubular; j++) {
      const v = (j / tubular) * Math.PI * 2;
      let x = (radius + tube * Math.cos(v)) * Math.cos(u);
      let y = tube * Math.sin(v);
      let z = (radius + tube * Math.cos(v)) * Math.sin(u);
      let nx = Math.cos(v) * Math.cos(u);
      let ny = Math.sin(v);
      let nz = Math.cos(v) * Math.sin(u);
      if (axis === "x") {
        [x, y, z] = [z, x, y];
        [nx, ny, nz] = [nz, nx, ny];
      } else if (axis === "z") {
        [x, y, z] = [x, z, y];
        [nx, ny, nz] = [nx, nz, ny];
      }
      positions.push(x + center[0], y + center[1], z + center[2]);
      normals.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < radial; i++) {
    for (let j = 0; j < tubular; j++) {
      const a = i * (tubular + 1) + j;
      const b = (i + 1) * (tubular + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

export type GlbStats = {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  partNames: string[];
  bbox: { min: [number, number, number]; max: [number, number, number] };
  size: [number, number, number];
};

export function meshStats(meshes: MeshData[]): GlbStats {
  let vertexCount = 0;
  let triangleCount = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    vertexCount += m.positions.length / 3;
    triangleCount += m.indices.length / 3;
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = 0;
    max[0] = max[1] = max[2] = 0;
  }
  return {
    meshCount: meshes.length,
    vertexCount,
    triangleCount,
    partNames: meshes.map((m) => m.name),
    bbox: { min, max },
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

export function partBounds(mesh: MeshData): { center: [number, number, number]; size: [number, number, number] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!Number.isFinite(min[0])) return { center: [0, 0, 0], size: [0, 0, 0] };
  return {
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

/** glTF 2.0 GLB 인코딩 (UV·내장 텍스처 포함) */
export function encodeGlb(meshes: MeshData[], generator = "EUM 3D SHOWROOM PRO"): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  const accessors: {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }[] = [];
  const materials: Record<string, unknown>[] = [];
  const meshDefs: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const images: { bufferView: number; mimeType: string; name?: string }[] = [];
  const textures: { sampler: number; source: number }[] = [];

  const pushView = (data: Buffer, target?: number) => {
    const pad = align4(offset) - offset;
    if (pad > 0) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(data);
    offset += data.length;
    return bufferViews.length - 1;
  };

  meshes.forEach((m, index) => {
    const posView = pushView(Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), 34962);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    const vertexCount = m.positions.length / 3;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: vertexCount,
      type: "VEC3",
      min: [min[0], min[1], min[2]],
      max: [max[0], max[1], max[2]],
    });
    const posAccessor = accessors.length - 1;
    let normAccessor: number | undefined;
    if (m.normals.length === m.positions.length) {
      const nView = pushView(Buffer.from(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength), 34962);
      accessors.push({ bufferView: nView, componentType: 5126, count: vertexCount, type: "VEC3" });
      normAccessor = accessors.length - 1;
    }
    const idxView = pushView(Buffer.from(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength), 34963);
    accessors.push({ bufferView: idxView, componentType: 5125, count: m.indices.length, type: "SCALAR" });
    const idxAccessor = accessors.length - 1;

    let uvAccessor: number | undefined;
    let textureIndex: number | undefined;
    if (m.uvs && m.texture && m.uvs.length === vertexCount * 2) {
      const uvView = pushView(Buffer.from(m.uvs.buffer, m.uvs.byteOffset, m.uvs.byteLength), 34962);
      accessors.push({ bufferView: uvView, componentType: 5126, count: vertexCount, type: "VEC2" });
      uvAccessor = accessors.length - 1;
      const imageView = pushView(m.texture.data);
      images.push({ bufferView: imageView, mimeType: m.texture.mimeType, ...(m.texture.name ? { name: m.texture.name } : {}) });
      textures.push({ sampler: 0, source: images.length - 1 });
      textureIndex = textures.length - 1;
    }

    const color = m.color ?? [0.62, 0.66, 0.71];
    const opacity = m.opacity ?? 1;
    const material: Record<string, unknown> = {
      name: `${m.name} Material`,
      doubleSided: true,
      pbrMetallicRoughness: {
        // 텍스처가 있으면 색을 더하지 않도록 흰색을 곱한다.
        baseColorFactor: textureIndex !== undefined ? [1, 1, 1, opacity] : [color[0], color[1], color[2], opacity],
        metallicFactor: textureIndex !== undefined ? 0 : m.metalness ?? 0.85,
        roughnessFactor: textureIndex !== undefined ? Math.max(0.7, m.roughness ?? 0.85) : m.roughness ?? 0.35,
        ...(textureIndex !== undefined ? { baseColorTexture: { index: textureIndex, texCoord: 0 } } : {}),
      },
    };
    if (opacity < 1) material.alphaMode = "BLEND";
    if (m.emissive) material.emissiveFactor = m.emissive;
    materials.push(material);

    meshDefs.push({
      name: m.name,
      primitives: [
        {
          attributes: {
            ...(normAccessor !== undefined ? { NORMAL: normAccessor } : {}),
            POSITION: posAccessor,
            ...(uvAccessor !== undefined ? { TEXCOORD_0: uvAccessor } : {}),
          },
          indices: idxAccessor,
          material: materials.length - 1,
          mode: 4,
        },
      ],
    });
    nodes.push({
      name: m.name,
      mesh: meshDefs.length - 1,
      ...(m.extras ? { extras: m.extras } : {}),
    });
    void index;
  });

  const bin = Buffer.concat(chunks);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]);
  const gltf = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ name: "EUM Showroom Scene", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: meshDefs,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binPadded.length }],
    ...(images.length > 0
      ? {
          images,
          textures,
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
        }
      : {}),
  };
  const jsonText = JSON.stringify(gltf);
  const jsonPadded = Buffer.concat([Buffer.from(jsonText, "utf8"), Buffer.alloc(align4(Buffer.byteLength(jsonText)) - Buffer.byteLength(jsonText), 0x20)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
}

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
  sparse?: unknown;
};
type GltfNode = {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};
type GltfDoc = {
  accessors: GltfAccessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers: { byteLength: number; uri?: string }[];
  nodes?: GltfNode[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; mode?: number; material?: number }[] }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
      baseColorTexture?: { index: number; texCoord?: number };
    };
    emissiveFactor?: number[];
    alphaMode?: string;
  }[];
  textures?: { sampler?: number; source?: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string; name?: string }[];
};

export type DecodedModel = { meshes: MeshData[]; doc: GltfDoc; glb: boolean };

function readAccessor(doc: GltfDoc, bin: Buffer, index: number): Float32Array {
  const accessor = doc.accessors[index];
  if (!accessor) return new Float32Array(0);
  const comps = TYPES[accessor.type] ?? 1;
  const count = accessor.count;
  const out = new Float32Array(count * comps);
  if (accessor.bufferView === undefined) return out;
  const view = doc.bufferViews[accessor.bufferView];
  if (!view) return out;
  const compSize = COMPONENTS[accessor.componentType] ?? 4;
  const stride = view.byteStride ?? comps * compSize;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < comps; c++) {
      const off = base + i * stride + c * compSize;
      if (off + compSize > bin.length) continue;
      let value = 0;
      switch (accessor.componentType) {
        case 5126:
          value = bin.readFloatLE(off);
          break;
        case 5125:
          value = bin.readUInt32LE(off);
          break;
        case 5123:
          value = bin.readUInt16LE(off);
          break;
        case 5122:
          value = bin.readInt16LE(off);
          break;
        case 5121:
          value = bin.readUInt8(off);
          break;
        case 5120:
          value = bin.readInt8(off);
          break;
        default:
          value = 0;
      }
      if (accessor.normalized) {
        if (accessor.componentType === 5123) value /= 65535;
        else if (accessor.componentType === 5121) value /= 255;
      }
      out[i * comps + c] = value;
    }
  }
  return out;
}

export function decodeGlb(buffer: Buffer): DecodedModel {
  if (buffer.length < 20 || buffer.subarray(0, 4).toString("latin1") !== "glTF") {
    throw new Error("GLB 가 아닙니다.");
  }
  let offset = 12;
  let json: GltfDoc | null = null;
  let bin: Buffer = Buffer.alloc(0);
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8")) as GltfDoc;
    if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB JSON 청크가 없습니다.");
  return { meshes: extractMeshes(json, bin), doc: json, glb: true };
}

export function decodeGltf(fileBuffer: Buffer): DecodedModel {
  const json = JSON.parse(fileBuffer.toString("utf8")) as GltfDoc;
  const gltfBuffer = json.buffers?.[0];
  let bin: Buffer = Buffer.alloc(0);
  if (gltfBuffer?.uri?.startsWith("data:")) {
    const base64 = gltfBuffer.uri.split(",")[1] ?? "";
    bin = Buffer.from(base64, "base64");
  } else if (gltfBuffer?.uri) {
    throw new Error("외부 .bin 버퍼를 참조하는 glTF 입니다. GLB 로 내보낸 후 업로드하세요.");
  }
  return { meshes: extractMeshes(json, bin), doc: json, glb: false };
}

function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function nodeMatrix(node: GltfNode): number[] {
  if (node.matrix && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transformPoint(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** glTF 머티리얼의 baseColor 텍스처를 PNG/JPEG 바이트로 해석한다(내장 bufferView 또는 data URI). */
function resolveTexture(doc: GltfDoc, bin: Buffer, textureIndex?: number): MeshTexture | null {
  if (textureIndex === undefined) return null;
  const texture = doc.textures?.[textureIndex];
  if (!texture || texture.source === undefined) return null;
  const image = doc.images?.[texture.source];
  if (!image) return null;
  const mimeType = image.mimeType ?? "image/png";
  if (image.bufferView !== undefined) {
    const view = doc.bufferViews[image.bufferView];
    if (!view) return null;
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (start < 0 || end > bin.length) return null;
    return { data: Buffer.from(bin.subarray(start, end)), mimeType, name: image.name };
  }
  if (image.uri?.startsWith("data:")) {
    const base64 = image.uri.split(",")[1] ?? "";
    if (!base64) return null;
    return { data: Buffer.from(base64, "base64"), mimeType: image.uri.slice(5, image.uri.indexOf(";")) || mimeType, name: image.name };
  }
  return null;
}

function extractMeshes(doc: GltfDoc, bin: Buffer): MeshData[] {
  const result: MeshData[] = [];
  const nodes = doc.nodes ?? [];
  const visit = (index: number, parent: number[], depth: number) => {
    const node = nodes[index];
    if (!node || depth > 32) return;
    const world = mat4Multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined && doc.meshes?.[node.mesh]) {
      const meshDef = doc.meshes[node.mesh];
      meshDef.primitives.forEach((prim, pi) => {
        if ((prim.mode ?? 4) !== 4) return;
        const posAccessor = prim.attributes.POSITION;
        if (posAccessor === undefined) return;
        const rawPos = readAccessor(doc, bin, posAccessor);
        const positions = new Float32Array(rawPos.length);
        for (let i = 0; i < rawPos.length; i += 3) {
          const [x, y, z] = transformPoint(world, rawPos[i], rawPos[i + 1], rawPos[i + 2]);
          positions[i] = x;
          positions[i + 1] = y;
          positions[i + 2] = z;
        }
        let normals: Float32Array = new Float32Array(positions.length);
        if (prim.attributes.NORMAL !== undefined) {
          const rawN = readAccessor(doc, bin, prim.attributes.NORMAL);
          for (let i = 0; i < rawN.length; i += 3) {
            const [x, y, z] = transformPoint(world, rawN[i], rawN[i + 1], rawN[i + 2]);
            const [tx, ty, tz] = transformPoint(world, 0, 0, 0);
            const n = norm([x - tx, y - ty, z - tz]);
            normals[i] = n[0];
            normals[i + 1] = n[1];
            normals[i + 2] = n[2];
          }
        } else {
          normals = computeNormals(positions, undefined);
        }
        const indices = prim.indices !== undefined ? new Uint32Array(readAccessor(doc, bin, prim.indices)) : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
        const mat = prim.material !== undefined ? doc.materials?.[prim.material] : undefined;
        const baseColor = mat?.pbrMetallicRoughness?.baseColorFactor;
        const uvAccessorIndex = prim.attributes.TEXCOORD_0;
        const uvs = uvAccessorIndex !== undefined ? readAccessor(doc, bin, uvAccessorIndex) : undefined;
        // 원본 GLB 의 baseColor 텍스처를 그대로 보존한다(재인코딩 시 텍스처 유실 방지).
        const texture = resolveTexture(doc, bin, mat?.pbrMetallicRoughness?.baseColorTexture?.index);
        const nameBase = (nodes.length > 1 ? meshDef.name ?? node.name : meshDef.name ?? node.name) ?? `Part_${result.length + 1}`;
        result.push({
          name: meshDef.primitives.length > 1 ? `${nameBase}_${pi + 1}` : nameBase,
          positions,
          normals,
          indices,
          ...(uvs && uvs.length === positions.length / 3 * 2 ? { uvs } : {}),
          ...(texture ? { texture } : {}),
          color: baseColor ? [baseColor[0], baseColor[1], baseColor[2]] : undefined,
          metalness: mat?.pbrMetallicRoughness?.metallicFactor,
          roughness: mat?.pbrMetallicRoughness?.roughnessFactor,
          opacity: baseColor && baseColor[3] !== undefined ? baseColor[3] : 1,
          emissive: mat?.emissiveFactor ? [mat.emissiveFactor[0], mat.emissiveFactor[1], mat.emissiveFactor[2]] : undefined,
        });
      });
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const sceneNodes = doc.nodes ?? [];
  if (sceneNodes.length === 0) return result;
  for (let i = 0; i < sceneNodes.length; i++) {
    const isChild = sceneNodes.some((n) => n.children?.includes(i));
    if (!isChild) visit(i, mat4Identity(), 0);
  }
  return result;
}

export function computeNormals(positions: Float32Array, indices?: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  const tri = indices ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  for (let i = 0; i < tri.length; i += 3) {
    const a = tri[i] * 3;
    const b = tri[i + 1] * 3;
    const c = tri[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const idx of [a, b, c]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = norm([normals[i], normals[i + 1], normals[i + 2]]);
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }
  return normals;
}

export type OptimizeReport = {
  beforeVertices: number;
  afterVertices: number;
  beforeTriangles: number;
  afterTriangles: number;
  removedDegenerate: number;
  mergedVertices: number;
  reductionPct: number;
};

/** 메시 최적화: 중복 정점 병합 + 퇴화 삼각형 제거 + 사용되지 않는 정점 정리 */
export function optimizeMeshes(meshes: MeshData[]): { meshes: MeshData[]; report: OptimizeReport } {
  let beforeVertices = 0;
  let afterVertices = 0;
  let beforeTriangles = 0;
  let afterTriangles = 0;
  let removedDegenerate = 0;
  let mergedVertices = 0;

  const optimized = meshes.map((mesh) => {
    beforeVertices += mesh.positions.length / 3;
    beforeTriangles += mesh.indices.length / 3;
    const map = new Map<string, number>();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] | null = mesh.uvs ? [] : null;
    const remap = new Uint32Array(mesh.positions.length / 3);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const u = uvs ? mesh.uvs![(i / 3) * 2] : 0;
      const v = uvs ? mesh.uvs![(i / 3) * 2 + 1] : 0;
      const key = uvs
        ? `${mesh.positions[i].toFixed(5)}|${mesh.positions[i + 1].toFixed(5)}|${mesh.positions[i + 2].toFixed(5)}|${u.toFixed(4)}|${v.toFixed(4)}`
        : `${mesh.positions[i].toFixed(5)}|${mesh.positions[i + 1].toFixed(5)}|${mesh.positions[i + 2].toFixed(5)}`;
      let idx = map.get(key);
      if (idx === undefined) {
        idx = positions.length / 3;
        map.set(key, idx);
        positions.push(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
        normals.push(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
        if (uvs) uvs.push(u, v);
      } else {
        mergedVertices += 1;
      }
      remap[i / 3] = idx;
    }
    const indices: number[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = remap[mesh.indices[i]];
      const b = remap[mesh.indices[i + 1]];
      const c = remap[mesh.indices[i + 2]];
      if (a === b || b === c || a === c) {
        removedDegenerate += 1;
        continue;
      }
      indices.push(a, b, c);
    }
    afterVertices += positions.length / 3;
    afterTriangles += indices.length / 3;
    return {
      ...mesh,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      ...(uvs ? { uvs: new Float32Array(uvs) } : {}),
      indices: new Uint32Array(indices),
    };
  });

  const reductionPct =
    beforeVertices > 0 ? Math.max(0, Math.round(((beforeVertices - afterVertices) / beforeVertices) * 1000) / 10) : 0;

  return {
    meshes: optimized,
    report: { beforeVertices, afterVertices, beforeTriangles, afterTriangles, removedDegenerate, mergedVertices, reductionPct },
  };
}

export function statsToJson(stats: GlbStats): Record<string, unknown> {
  return {
    meshCount: stats.meshCount,
    vertexCount: stats.vertexCount,
    triangleCount: stats.triangleCount,
    partNames: stats.partNames,
    bbox: stats.bbox,
    size: stats.size.map((v) => Math.round(v * 100) / 100),
  };
}
