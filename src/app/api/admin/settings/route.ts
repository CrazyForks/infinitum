import { requireAdmin } from "@/lib/admin/session";
import { adminErrorResponse } from "@/lib/admin/http";
import { getAdminSettings } from "@/lib/settings/service";

export async function GET() {
  try {
    await requireAdmin();

    return Response.json(await getAdminSettings());
  } catch (error) {
    return adminErrorResponse(error, 401, "Unauthorized");
  }
}
