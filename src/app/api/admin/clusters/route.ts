import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAdminClusters } from "@/lib/feed/repository";

function parseMinItemCount(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const search = searchParams.get("search")?.trim() ?? "";
    const minItemCount = parseMinItemCount(searchParams.get("minItemCount"));

    const result = await listAdminClusters(page, pageSize, search, { minItemCount });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
