import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import UploadWizard from "./UploadWizard";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const clients =
    user.role === "ADMIN"
      ? await prisma.client.findMany({
          where: { expiresAt: { gt: new Date() } },
          select: { id: true, name: true, plan: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
  return <UploadWizard clients={clients} />;
}
