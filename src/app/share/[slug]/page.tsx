import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { buildShowroomPayload } from "@/lib/showroom-data";
import ShowroomClient from "@/components/showroom/ShowroomClient";
import ShareGate from "./ShareGate";
import { shareCookie } from "@/lib/api";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return prisma.shareLink.findUnique({
    where: { slug },
    include: { project: { include: { client: true } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const link = await load(slug).catch(() => null);
  return {
    title: link ? `${link.project.title} — EUM 3D SHOWROOM` : "EUM 3D SHOWROOM",
    description: link?.project.description ?? "산업용 3D 쇼룸",
  };
}

export default async function SharePage({ params }: Params) {
  const { slug } = await params;
  const link = await load(slug);
  if (!link) notFound();

  const inner = (
    <div className="grid min-h-[100dvh] place-items-center px-4 text-center">
      <div className="card max-w-md p-8">
        <p className="text-sm font-bold text-slate-200">
          {link.isActive ? "공유 링크가 만료되었습니다" : "공유가 중지된 링크입니다"}
        </p>
        <p className="mt-2 text-xs text-slate-500">쇼룸 소유자에게 새 공유 링크를 요청하세요.</p>
        <Link href="/" className="btn btn-ghost mt-4">
          EUM 3D SHOWROOM PRO
        </Link>
      </div>
    </div>
  );

  if (!link.isActive) return inner;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return inner;
  if (link.project.status !== "READY") {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-4 text-center">
        <div className="card max-w-md p-8">
          <p className="text-sm font-bold text-slate-200">쇼룸 준비 중입니다</p>
          <p className="mt-2 text-xs text-slate-500">잠시 후 다시 접속하거나 공유한 담당자에게 문의하세요.</p>
        </div>
      </div>
    );
  }

  if (link.passwordHash) {
    const store = await cookies();
    const expected = shareCookie(slug);
    const passed = store.get(expected.name)?.value === expected.value;
    if (!passed) {
      return (
        <ShareGate
          slug={slug}
          title={link.project.title}
          clientName={link.project.client?.name ?? null}
          accent={link.project.client?.primaryColor ?? "#2dd4bf"}
        />
      );
    }
  }

  await prisma.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 } } }).catch(() => null);

  const payload = await buildShowroomPayload(link.projectId, { forShare: true });
  if (!payload || !payload.project.modelUrl) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-4 text-center">
        <div className="card max-w-md p-8">
          <p className="text-sm font-bold text-slate-200">쇼룸을 표시할 수 없습니다</p>
          <p className="mt-2 text-xs text-slate-500">모델이 준비되지 않았습니다.</p>
        </div>
      </div>
    );
  }

  return <ShowroomClient payload={payload} mode="share" />;
}
