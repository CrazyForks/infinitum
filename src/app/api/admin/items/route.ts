import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listFilteredItems } from "@/lib/feed/repository";

const MODERATION_REASONS = new Set([
  "marketing",
  "low_quality",
  "duplicate_noise",
  "rule_filter",
  "rule_blacklist",
  "other",
]);

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
    const moderationReason = searchParams.get("reason")?.trim() ?? "";

    const result = await listFilteredItems(page, pageSize, {
      search: searchParams.get("search")?.trim() ?? "",
      sourceName: searchParams.get("sourceName")?.trim() ?? "",
      moderationReason: MODERATION_REASONS.has(moderationReason) ? moderationReason : "",
    });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
