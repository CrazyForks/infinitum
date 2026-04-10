import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinitum Feed",
  description: "一个支持抓取、过滤、翻译与摘要的信息流面板。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
