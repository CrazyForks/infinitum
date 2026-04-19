import { redirect } from "next/navigation";

import { getAdminSession } from "@/lib/admin/session";

export default async function AdminMonitorPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/login?redirect=/admin");
  }

  redirect("/admin");
}
