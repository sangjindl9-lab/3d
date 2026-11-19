import { json } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.count();
  return json({ ok: true, service: "eum3d-showroom-pro", projects, time: new Date().toISOString() });
}
