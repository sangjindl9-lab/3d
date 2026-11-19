import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import UploadWizard from "./UploadWizard";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <UploadWizard />;
}
