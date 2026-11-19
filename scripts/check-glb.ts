import { decodeGlb, meshStats } from "../src/lib/glb";
import { readFileSync } from "node:fs";
const id = process.argv[2];
const buf = readFileSync(`storage/projects/${id}/model.glb`);
const dec = decodeGlb(buf);
const stats = meshStats(dec.meshes);
console.log("meshes", dec.meshes.length, "verts", stats.vertexCount, "tris", stats.triangleCount, "size", stats.size.map((v) => v.toFixed(2)));
console.log(dec.meshes.map((m) => m.name).join(", "));
