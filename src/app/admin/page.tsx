import { redirect } from "next/navigation";
import { AdminPageClient } from "@/components/admin/admin-page-client";
import { getAdminSession } from "@/lib/admin/session";
import { getSourceMonitorSnapshot } from "@/lib/source-monitor/service";
import { getAdminSettings } from "@/lib/settings/service";
import { getBackgroundTaskMonitorSnapshot } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/login?redirect=/admin");
  }

  const settings = await getAdminSettings();
  const monitorSnapshot = await getBackgroundTaskMonitorSnapshot();
  const sourceMonitorSnapshot = await getSourceMonitorSnapshot();

  return (
    <AdminPageClient
      initialSettings={settings}
      initialSnapshot={monitorSnapshot}
      initialSourceMonitorSnapshot={sourceMonitorSnapshot}
    />
  );
}
