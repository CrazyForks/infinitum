import { redirect } from "next/navigation";

import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { getAdminSession } from "@/lib/admin/session";
import { getAdminSettings } from "@/lib/settings/service";

export default async function AdminSettingsPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/admin/login");
  }

  const settings = await getAdminSettings();

  return <AdminSettingsPanel initialSettings={settings} />;
}
