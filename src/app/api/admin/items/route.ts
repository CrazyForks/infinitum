import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listFilteredItems } from "@/lib/feed/repository";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const moderationStatus = searchParams.get("moderationStatus");

    if (moderationStatus && moderationStatus !== "filtered") {
      return Response.json({ items: [] });
    }

    const items = await listFilteredItems();

    return Response.json({ items });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
