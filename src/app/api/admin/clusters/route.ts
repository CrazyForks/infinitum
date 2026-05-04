import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAdminClusters } from "@/lib/feed/repository";

const CLUSTER_STATUSES = new Set(["active", "hidden"]);
const CLUSTER_TIME_RANGES = new Set(["today", "week", "month"]);

function parseMinItemCount(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getLocalDayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getLatestItemUpdatedAtStart(timeRange: string | null, now = new Date()) {
  if (!timeRange || !CLUSTER_TIME_RANGES.has(timeRange)) {
    return null;
  }

  const start = getLocalDayStart(now);
  if (timeRange === "week") {
    start.setDate(start.getDate() - 6);
  } else if (timeRange === "month") {
    start.setDate(start.getDate() - 29);
  }

  return start;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const search = searchParams.get("search")?.trim() ?? "";
    const minItemCount = parseMinItemCount(searchParams.get("minItemCount"));
    const status = searchParams.get("status")?.trim() ?? "";
    const latestItemUpdatedAtStart = getLatestItemUpdatedAtStart(searchParams.get("timeRange"));

    const result = await listAdminClusters(page, pageSize, search, {
      minItemCount,
      status: CLUSTER_STATUSES.has(status) ? (status as "active" | "hidden") : null,
      latestItemUpdatedAtStart,
    });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
