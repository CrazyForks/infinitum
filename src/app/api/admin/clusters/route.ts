import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAdminClusters } from "@/lib/feed/repository";

export async function GET() {
  try {
    await requireAdmin();
    const clusters = await listAdminClusters();

    return Response.json({ clusters });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
