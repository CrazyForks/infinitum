import { redirect } from "next/navigation";

import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";
import { getAdminSession } from "@/lib/admin/session";
import { getBackgroundTaskMonitorSnapshot } from "@/lib/tasks/service";

export default async function AdminMonitorPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/admin/login");
  }

  const snapshot = await getBackgroundTaskMonitorSnapshot();

  return <AdminMonitorPanel initialSnapshot={snapshot} />;
}
