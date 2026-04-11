import { requireAdmin } from "@/lib/admin/session";
import { getAdminErrorStatus } from "@/lib/admin/http";
import { getAdminSettings } from "@/lib/settings/service";

export async function GET() {
  try {
    await requireAdmin();

    return Response.json(await getAdminSettings());
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: getAdminErrorStatus(error, 401) },
    );
  }
}
