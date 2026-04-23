import { adminErrorResponse } from "@/lib/admin/http";
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
    return adminErrorResponse(error, 400, "删除内容失败。");
  }
}
