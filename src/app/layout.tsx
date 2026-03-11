import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.scss";

// Noto Sans KR 폰트 설정
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "고고 다이노 키즈카페 주차 정산",
  description: "고고 다이노 키즈카페 주차 정산 시스템",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,  // 사용자가 임의로 확대/축소 금지
};

export default function RootLayout(
  { children }: Readonly<{ children: React.ReactNode }>
) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.className} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
