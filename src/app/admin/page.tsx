import { redirect } from "next/navigation";
import { AdminPageClient } from "@/components/admin/admin-page-client";
import { getAdminSession } from "@/lib/admin/session";
import { listPublicHeaderLinks } from "@/lib/settings/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/login?redirect=/admin");
  }

  const headerLinks = await listPublicHeaderLinks();

  return <AdminPageClient headerLinks={headerLinks} />;
}
