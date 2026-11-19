import { fail } from "@/lib/api";
import { mimeFor, readStored } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const relative = path.join("/");
  try {
    const data = await readStored(relative);
    const body = new Uint8Array(data);
    return new Response(body, {
      headers: {
        "Content-Type": mimeFor(relative),
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return fail("파일을 찾을 수 없습니다.", 404);
  }
}
