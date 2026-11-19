import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canManageClient, canManageLicense, canManageUsers } from "@/lib/permissions";
import { parseFeatures } from "@/lib/license";
import { fileUrl } from "@/lib/storage";
import ClientAdmin from "./ClientAdmin";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canManageClient(user, id)) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-sm font-bold text-rose-300">접근 권한이 없습니다</p>
          <Link href="/dashboard" className="btn btn-ghost mt-4">
            대시보드로
          </Link>
        </div>
      </div>
    );
  }
  const client = await prisma.client.findUnique({
    where: { id },
    include: { _count: { select: { users: true, projects: true } } },
  });
  if (!client) notFound();
  const users = await prisma.user.findMany({
    where: canManageLicense(user) ? {} : { clientId: id },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Link href="/dashboard/clients" className="hover:text-slate-200">
          고객사 · 브랜딩
        </Link>
        <span>/</span>
        <span className="text-slate-300">{client.name}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">{client.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {client.plan} 플랜 · 만료 {new Date(client.expiresAt).toLocaleDateString("ko-KR")} · 기능 {parseFeatures(client.features).length}종
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          대시보드
        </Link>
      </div>
      <div className="mt-5">
        <ClientAdmin
          client={{
            id: client.id,
            name: client.name,
            slug: client.slug,
            plan: client.plan,
            expiresAt: client.expiresAt.toISOString(),
            maxProjects: client.maxProjects,
            maxUsers: client.maxUsers,
            features: parseFeatures(client.features),
            projectCount: client._count.projects,
            userCount: client._count.users,
            logoUrl: fileUrl(client.logoPath),
            primaryColor: client.primaryColor,
            accentColor: client.accentColor,
            slogan: client.slogan,
            headerText: client.headerText,
            footerText: client.footerText,
            contactEmail: client.contactEmail,
            businessNo: client.businessNo,
          }}
          users={users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            clientId: u.clientId,
            clientName: u.client?.name ?? null,
            createdAt: u.createdAt.toISOString(),
          }))}
          isAdmin={canManageLicense(user)}
          canManageUsers={canManageUsers(user, id)}
        />
      </div>
    </div>
  );
}
