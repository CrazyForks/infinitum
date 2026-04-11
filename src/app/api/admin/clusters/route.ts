import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAdminClusters } from "@/lib/feed/repository";

export async function GET() {
  try {
    await requireAdmin();
    const clusters = await listAdminClusters();

    return Response.json({ clusters });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
