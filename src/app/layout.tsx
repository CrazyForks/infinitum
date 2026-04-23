import type { Metadata } from "next";
import localFont from "next/font/local";

import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

const brandFont = localFont({
  src: "./fonts/LXGWWenKaiMono.ttf",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "Infinitum",
  description: "面向抓取、审核、聚合与监控的高密度信息流后台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={brandFont.variable} lang="zh-CN">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
