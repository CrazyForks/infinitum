import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { deleteItem } from "@/lib/items/service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteItem(id);

    return Response.json({
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "删除内容失败。",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
