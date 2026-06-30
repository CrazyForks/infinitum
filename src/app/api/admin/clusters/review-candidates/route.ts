import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listClusterReviewCandidates } from "@/lib/clusters/decisions";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const result = await listClusterReviewCandidates(page, pageSize);

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
