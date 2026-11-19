import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createShareLink, deactivateShareLinks, findActiveShare, shareState } from "@/lib/share";
import { makeClient, makeProject, makeUser, resetDb } from "./helpers";
import { GET as qrGET } from "@/app/api/share/[slug]/qr/route";
import { POST as unlockPOST } from "@/app/api/share/[slug]/unlock/route";

async function readyProject(features?: string[]) {
  const client = await makeClient({ features });
  const user = await makeUser(client.id);
  const project = await makeProject(client.id, user.id, { status: "READY" });
  return { client, user, project, actor: { id: user.id, role: user.role, clientId: user.clientId } };
}

describe("공유 링크 · QR API", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("공유 링크를 발급하고 같은 링크를 재사용한다", async () => {
    const { project, actor } = await readyProject();
    const first = await createShareLink({ projectId: project.id, actor });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.slug.length).toBeGreaterThanOrEqual(8);
    const second = await createShareLink({ projectId: project.id, actor });
    expect(second.ok && second.slug).toBe(first.slug);
  });

  it("재발급하면 기존 링크를 비활성화하고 새 slug 를 만든다", async () => {
    const { project, actor } = await readyProject();
    const first = await createShareLink({ projectId: project.id, actor });
    const regenerated = await createShareLink({ projectId: project.id, actor, regenerate: true });
    expect(first.ok && regenerated.ok).toBe(true);
    if (!first.ok || !regenerated.ok) return;
    expect(regenerated.slug).not.toBe(first.slug);
    const old = await prisma.shareLink.findUnique({ where: { slug: first.slug } });
    expect(old?.isActive).toBe(false);
  });

  it("비밀번호·만료일을 설정하고 만료 링크를 구분한다", async () => {
    const { project, actor } = await readyProject();
    const result = await createShareLink({ projectId: project.id, actor, password: "eum2026", days: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasPassword).toBe(true);
    expect(result.expiresAt).toBeTruthy();
    const link = await prisma.shareLink.findUnique({ where: { slug: result.slug } });
    expect(link?.passwordHash?.startsWith("scrypt$")).toBe(true);
    expect(shareState(link)).toBe("ACTIVE");
    await prisma.shareLink.update({ where: { slug: result.slug }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await prisma.shareLink.findUnique({ where: { slug: result.slug } });
    expect(shareState(expired)).toBe("EXPIRED");
  });

  it("라이선스 만료/기능 미포함/미준비 상태를 차단한다", async () => {
    const expired = await readyProject();
    await prisma.client.update({ where: { id: expired.client.id }, data: { expiresAt: new Date(Date.now() - 86400000) } });
    const expiredResult = await createShareLink({ projectId: expired.project.id, actor: expired.actor });
    expect(expiredResult.ok).toBe(false);
    if (!expiredResult.ok) expect(expiredResult.code).toBe("LICENSE_EXPIRED");

    const noShare = await readyProject(["SNAPSHOT"]);
    const noShareResult = await createShareLink({ projectId: noShare.project.id, actor: noShare.actor });
    expect(noShareResult.ok).toBe(false);
    if (!noShareResult.ok) expect(noShareResult.code).toBe("FEATURE_NOT_INCLUDED");

    const draft = await readyProject();
    await prisma.project.update({ where: { id: draft.project.id }, data: { status: "DRAFT" } });
    const draftResult = await createShareLink({ projectId: draft.project.id, actor: draft.actor });
    expect(draftResult.ok).toBe(false);
    if (!draftResult.ok) expect(draftResult.code).toBe("NOT_READY");
  });

  it("권한 없는 사용자는 공유 링크를 만들 수 없다", async () => {
    const { project, client } = await readyProject();
    const outsider = await makeUser(client.id, "USER");
    const otherClient = await makeClient();
    const otherUser = await makeUser(otherClient.id);
    const result = await createShareLink({ projectId: project.id, actor: { id: otherUser.id, role: "USER", clientId: otherClient.id } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    const own = await createShareLink({ projectId: project.id, actor: { id: outsider.id, role: "USER", clientId: client.id } });
    expect(own.ok).toBe(false);
  });

  it("QR 코드를 PNG/SVG 로 생성한다", async () => {
    const { project, actor } = await readyProject();
    const share = await createShareLink({ projectId: project.id, actor });
    if (!share.ok) throw new Error("share failed");
    const png = await qrGET(new Request(`http://localhost:3000/api/share/${share.slug}/qr?format=png&size=256`), { params: Promise.resolve({ slug: share.slug }) });
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toContain("image/png");
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    expect(pngBytes.length).toBeGreaterThan(100);
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);

    const svg = await qrGET(new Request(`http://localhost:3000/api/share/${share.slug}/qr?format=svg&download=1`), { params: Promise.resolve({ slug: share.slug }) });
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
    expect(svg.headers.get("content-disposition")).toContain("attachment");
  });

  it("비활성 링크의 QR 은 404 이다", async () => {
    const { project, actor } = await readyProject();
    const share = await createShareLink({ projectId: project.id, actor });
    if (!share.ok) throw new Error("share failed");
    await deactivateShareLinks(project.id);
    const res = await qrGET(new Request(`http://localhost:3000/api/share/${share.slug}/qr`), { params: Promise.resolve({ slug: share.slug }) });
    expect(res.status).toBe(404);
    expect(shareState(await findActiveShare(share.slug))).toBe("INACTIVE");
  });

  it("비밀번호 잠금 해제 API 가 올바르게 동작한다", async () => {
    const { project, actor } = await readyProject();
    const share = await createShareLink({ projectId: project.id, actor, password: "eum2026" });
    if (!share.ok) throw new Error("share failed");
    const wrong = await unlockPOST(
      new Request(`http://localhost:3000/api/share/${share.slug}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "nope" }) }),
      { params: Promise.resolve({ slug: share.slug }) },
    );
    expect(wrong.status).toBe(401);

    const ok = await unlockPOST(
      new Request(`http://localhost:3000/api/share/${share.slug}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "eum2026" }) }),
      { params: Promise.resolve({ slug: share.slug }) },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain(`eum3d_share_${share.slug}`);
    const payload = (await ok.json()) as { unlocked: boolean };
    expect(payload.unlocked).toBe(true);
  });
});
