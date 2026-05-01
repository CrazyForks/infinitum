import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { mergeSelectedItemsToLargestCluster } from "@/lib/clusters/service";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json()) as { itemIds?: unknown };
    const itemIds = Array.isArray(body.itemIds)
      ? [...new Set(body.itemIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))]
      : [];

    if (itemIds.length < 2) {
      return Response.json({ error: "至少需要选择两个条目进行合并" }, { status: 400 });
    }

    const result = await mergeSelectedItemsToLargestCluster(itemIds);

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    return adminErrorResponse(error, 400, "批量合并失败");
  }
}
