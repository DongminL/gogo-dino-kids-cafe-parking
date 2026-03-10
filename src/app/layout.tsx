import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "고고 다이노 키즈카페 주차 정산",
  description: "고고 다이노 키즈카페 주차 정산 시스템",
  manifest: "/manifest.json"
};

export default function RootLayout(
  { children }: Readonly<{ children: React.ReactNode }>
) {
  return (
    <html lang="ko">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
