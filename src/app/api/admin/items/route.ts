import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listFilteredItems } from "@/lib/feed/repository";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const moderationStatus = searchParams.get("moderationStatus");

    if (moderationStatus && moderationStatus !== "filtered") {
      return Response.json({ items: [], total: 0, page: 1, pageSize: 20 });
    }

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    const result = await listFilteredItems(page, pageSize);

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
