import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getAdminSession } from "@/lib/admin/session";

export default async function AdminLoginPage() {
  const session = await getAdminSession();

  if (session.isAdmin) {
    redirect("/admin/settings");
  }

  return <AdminLoginForm />;
}
