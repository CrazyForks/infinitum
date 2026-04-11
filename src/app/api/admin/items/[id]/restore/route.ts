import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { mapItemToReviewItem } from "@/lib/feed/repository";
import { restoreFilteredItem } from "@/lib/items/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/items/[id]/restore">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const item = await restoreFilteredItem(id);

    return Response.json({
      item: mapItemToReviewItem(item),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
