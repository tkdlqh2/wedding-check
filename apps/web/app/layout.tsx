import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./design-tokens.css";

export const metadata: Metadata = {
  title: "웨딩체크",
  description: "웨딩홀 스캔 오퍼레이터 인수인계 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
