import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getSourceMonitorSnapshot } from "@/lib/source-monitor/service";
import type { SourceInactivityBucketKey, SourceMonitorHealthStatus } from "@/lib/source-monitor/types";

const HEALTH_STATUS_VALUES = new Set<SourceMonitorHealthStatus>(["healthy", "failed", "unknown"]);
const INACTIVITY_VALUES = new Set<SourceInactivityBucketKey>([
  "day",
  "week",
  "month",
  "quarter",
  "half_year",
  "year",
]);

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHealthStatus(value: string | null) {
  return value && HEALTH_STATUS_VALUES.has(value as SourceMonitorHealthStatus)
    ? value
    : "all";
}

function parseInactivity(value: string | null) {
  return value && INACTIVITY_VALUES.has(value as SourceInactivityBucketKey)
    ? value
    : "all";
}

function parseGroupName(value: string | null) {
  const normalized = value?.trim();
  return normalized && normalized !== "all" ? normalized : "all";
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(100, parsePositiveInteger(searchParams.get("pageSize"), 10));
    const healthStatus = parseHealthStatus(searchParams.get("healthStatus"));
    const inactivity = parseInactivity(searchParams.get("inactivity"));
    const groupName = parseGroupName(searchParams.get("groupName"));

    return Response.json(
      await getSourceMonitorSnapshot(new Date(), {
        page,
        pageSize,
        healthStatus,
        inactivity,
        groupName,
      }),
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
