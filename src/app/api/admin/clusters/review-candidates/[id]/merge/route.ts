import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getPendingClusterReviewDecision, markDecisionApplied } from "@/lib/clusters/decisions";
import { mergeClusters } from "@/lib/clusters/service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const candidate = await getPendingClusterReviewDecision(id);

    if (!candidate) {
      return adminErrorResponse(new Error("复核候选不存在或已处理"), 404);
    }

    const result = await mergeClusters(candidate.targetClusterId, [candidate.sourceClusterId]);
    await markDecisionApplied(id, "manual_review_merge");

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    return adminErrorResponse(error, 400, "复核合并失败");
  }
}
