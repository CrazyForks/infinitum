import type { Metadata } from "next";
import localFont from "next/font/local";

import "antd/dist/reset.css";
import "./globals.css";

const luminaMono = localFont({
  src: "./fonts/LXGWWenKaiMono.ttf",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-lumina",
});

export const metadata: Metadata = {
  title: "Infinitum Lumina Console",
  description: "面向抓取、审核、聚合与监控的高密度信息流后台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={luminaMono.variable} lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
