import { prisma } from "@/lib/db";
import { actor, fail, json, parseBody } from "@/lib/api";
import { canEditProject } from "@/lib/permissions";
import { materialPreset } from "@/lib/constants";

type Body = {
  name?: string;
  partNumber?: string;
  description?: string;
  material?: string;
  spec?: string;
  weight?: number;
  quantity?: number;
  exploded?: [number, number, number];
  explodedDistance?: number;
  visible?: boolean;
  opacity?: number;
  color?: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await actor();
  if (!user) return fail("로그인이 필요합니다.", 401);
  const part = await prisma.part.findUnique({ where: { id }, include: { project: true } });
  if (!part) return fail("부품을 찾을 수 없습니다.", 404);
  if (!canEditProject(user, { ownerId: part.project.ownerId, clientId: part.project.clientId, isDemo: part.project.isDemo })) {
    return fail("편집 권한이 없습니다.", 403);
  }
  const body = await parseBody<Body>(request);
  if (!body) return fail("요청 형식이 올바르지 않습니다.");
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.partNumber === "string") data.partNumber = body.partNumber.slice(0, 40);
  if (typeof body.description === "string") data.description = body.description.slice(0, 1000);
  if (typeof body.material === "string") {
    data.material = body.material;
    data.color = materialPreset(body.material).color;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;
  if (typeof body.spec === "string") data.spec = body.spec.slice(0, 120);
  if (typeof body.weight === "number" && Number.isFinite(body.weight) && body.weight >= 0) data.weight = body.weight;
  if (typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1) data.quantity = Math.round(body.quantity);
  if (Array.isArray(body.exploded) && body.exploded.length === 3 && body.exploded.every((v) => typeof v === "number" && Number.isFinite(v))) {
    const [x, y, z] = body.exploded;
    const len = Math.hypot(x, y, z) || 1;
    data.explodedX = x / len;
    data.explodedY = y / len;
    data.explodedZ = z / len;
  }
  if (typeof body.explodedDistance === "number" && Number.isFinite(body.explodedDistance)) {
    data.explodedDistance = Math.max(0, Math.min(4, body.explodedDistance));
  }
  if (typeof body.visible === "boolean") data.visible = body.visible;
  if (typeof body.opacity === "number" && body.opacity >= 0 && body.opacity <= 1) data.opacity = body.opacity;

  const updated = await prisma.part.update({ where: { id }, data });
  return json({ ok: true, part: updated });
}
