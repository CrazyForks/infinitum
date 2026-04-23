import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { detachItemFromCluster } from "@/lib/clusters/service";
import { getAdminCluster } from "@/lib/feed/repository";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/admin/clusters/[id]/items/[itemId]/detach">,
) {
  try {
    await requireAdmin();
    const { id, itemId } = await context.params;
    await detachItemFromCluster(itemId);

    return Response.json({
      cluster: await getAdminCluster(id),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
