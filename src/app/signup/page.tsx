import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import SignupForm from "./SignupForm";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="card w-full max-w-md p-7">
        <Link href="/" className="mb-5 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-sky-400 text-[13px] font-black text-[#04121a]">E</span>
          <span className="text-xs font-black tracking-tight">EUM 3D SHOWROOM PRO</span>
        </Link>
        <h1 className="text-xl font-black">회원가입</h1>
        <p className="mt-1 text-xs text-slate-500">쇼룸 열람·제작 계정을 만듭니다. 고객사 배정은 관리자가 승인합니다.</p>
        <div className="mt-5">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
