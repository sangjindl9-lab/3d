import { fail } from "@/lib/api";
import { mimeFor, readStored } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const relative = path.join("/");
  try {
    const data = await readStored(relative);
    const body = new Uint8Array(data);
    const isModel = /\.(glb|gltf)$/i.test(relative);
    return new Response(body, {
      headers: {
        "Content-Type": mimeFor(relative),
        "Content-Length": String(data.length),
        // 모델·참고 이미지는 같은 경로로 재생성되므로 반드시 재검증한다(캐시된 이전 모델 방지).
        "Cache-Control": isModel ? "public, max-age=0, must-revalidate" : "public, max-age=3600",
      },
    });
  } catch {
    return fail("파일을 찾을 수 없습니다.", 404);
  }
}
