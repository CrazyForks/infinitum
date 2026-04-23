import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getAdminCluster } from "@/lib/feed/repository";

export async function GET(_request: Request, context: RouteContext<"/api/admin/clusters/[id]">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const cluster = await getAdminCluster(id);

    if (!cluster) {
      return Response.json({ error: "Cluster not found" }, { status: 404 });
    }

    return Response.json({ cluster });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
