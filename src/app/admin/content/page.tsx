import { redirect } from "next/navigation";

import { ContentReviewPanel } from "@/components/admin/content-review-panel";
import { getAdminSession } from "@/lib/admin/session";

export default async function AdminContentPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/admin/login");
  }

  return <ContentReviewPanel />;
}
