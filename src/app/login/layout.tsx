import type { Metadata } from "next";

import { PRIVATE_ROBOTS, SITE_NAME } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "管理员登录",
  robots: PRIVATE_ROBOTS,
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: `管理员登录 | ${SITE_NAME}`,
  },
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
