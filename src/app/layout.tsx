import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EUM 3D SHOWROOM PRO — 이음 3D 쇼룸 프로",
  description:
    "산업용 3D 쇼룸 플랫폼. CAD·도면 업로드부터 실감형 3D 쇼룸, 분해도, 조립/금형/기계 애니메이션, 영상·이미지·공유까지.",
  applicationName: "EUM 3D SHOWROOM PRO",
  keywords: ["3D 쇼룸", "금형", "산업장비", "분전반", "플랜트", "CAD", "GLB", "쇼룸"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
