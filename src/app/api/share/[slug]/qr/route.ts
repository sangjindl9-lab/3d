import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/api";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const link = await prisma.shareLink.findUnique({ where: { slug }, include: { project: { select: { title: true } } } });
  if (!link || !link.isActive) return fail("유효하지 않은 공유 링크입니다.", 404);
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "png").toLowerCase();
  const size = Math.min(2048, Math.max(120, Number(url.searchParams.get("size") ?? 512) || 512));
  const download = url.searchParams.get("download") === "1";
  const origin = `${url.protocol}//${url.host}`;
  const target = `${origin}/share/${slug}`;

  if (format === "svg") {
    const svg = await QRCode.toString(target, {
      type: "svg",
      margin: 2,
      width: size,
      color: { dark: "#04121a", light: "#ffffff" },
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        ...(download ? { "Content-Disposition": `attachment; filename="eum3d-${slug}.svg"` } : {}),
      },
    });
  }

  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#04121a", light: "#ffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="eum3d-${slug}.png"` } : {}),
    },
  });
}
