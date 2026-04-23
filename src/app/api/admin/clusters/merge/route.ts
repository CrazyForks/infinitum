import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { mergeClusters } from "@/lib/clusters/service";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { targetClusterId, sourceClusterIds } = body;

    if (!targetClusterId || typeof targetClusterId !== "string") {
      return Response.json(
        { error: "目标聚合组ID是必填项" },
        { status: 400 }
      );
    }

    if (!Array.isArray(sourceClusterIds) || sourceClusterIds.length === 0) {
      return Response.json(
        { error: "至少需要选择一个要合并的聚合组" },
        { status: 400 }
      );
    }

    if (sourceClusterIds.includes(targetClusterId)) {
      return Response.json(
        { error: "目标聚合组不能在待合并列表中" },
        { status: 400 }
      );
    }

    const result = await mergeClusters(targetClusterId, sourceClusterIds);

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    return adminErrorResponse(error, 400, "合并聚合组失败");
  }
}
