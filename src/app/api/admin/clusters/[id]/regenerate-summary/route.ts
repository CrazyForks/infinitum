import { createAiProvider } from "@/lib/ai/provider";
import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { recomputeCluster } from "@/lib/clusters/service";
import { getAdminCluster } from "@/lib/feed/repository";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/clusters/[id]/regenerate-summary">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const runtimeConfig = await getIngestionRuntimeConfig();

    await recomputeCluster(
      id,
      createAiProvider(runtimeConfig.modelApi, {
        itemAnalysisPrompt: runtimeConfig.prompts.itemAnalysis,
        clusterSummaryPrompt: runtimeConfig.prompts.clusterSummary,
        clusterMatchPrompt: runtimeConfig.prompts.clusterMatch,
      }),
    );

    return Response.json({
      cluster: await getAdminCluster(id),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
