import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import localFont from "next/font/local";

import { ToastProvider } from "@/components/ui/toast";
import {
  getMetadataBase,
  PUBLIC_ROBOTS,
  SEO_KEYWORDS,
  SITE_DEFAULT_DESCRIPTION,
  SITE_DEFAULT_TITLE,
  SITE_NAME,
} from "@/lib/seo/metadata";

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
  metadataBase: getMetadataBase(),
  applicationName: SITE_NAME,
  title: {
    default: SITE_DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DEFAULT_DESCRIPTION,
  keywords: SEO_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: PUBLIC_ROBOTS,
  alternates: {
    canonical: "/",
    languages: {
      "zh-CN": "/",
    },
    types: {
      "application/rss+xml": [
        { title: "Infinitum 资讯聚合 RSS", url: "/api/feed/rss" },
        { title: "Infinitum AI 日报 RSS", url: "/api/daily/rss" },
      ],
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: SITE_DEFAULT_TITLE,
    description: SITE_DEFAULT_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary",
    title: SITE_DEFAULT_TITLE,
    description: SITE_DEFAULT_DESCRIPTION,
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={brandFont.variable} lang="zh-CN">
      <body>
        <AntdRegistry>
          <ToastProvider>{children}</ToastProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
