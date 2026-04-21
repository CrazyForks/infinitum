import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { moveItemToCluster } from "@/lib/clusters/service";
import { getAdminCluster } from "@/lib/feed/repository";

const joinClusterSchema = z.object({
  clusterId: z.string().min(1),
});

export async function POST(request: Request, context: RouteContext<"/api/admin/items/[id]/join-cluster">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = joinClusterSchema.parse(await request.json());

    await moveItemToCluster(id, body.clusterId);

    return Response.json({
      cluster: await getAdminCluster(body.clusterId),
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
