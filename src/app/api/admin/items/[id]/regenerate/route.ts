import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { mapItemToFeedItem } from "@/lib/feed/repository";
import { regenerateItemContent } from "@/lib/items/service";

const regenerateSchema = z.object({
  target: z.enum(["translation", "summary"]),
});

export async function POST(request: Request, context: RouteContext<"/api/admin/items/[id]/regenerate">) {
  try {
    await requireAdmin();
    const body = regenerateSchema.parse(await request.json());
    const { id } = await context.params;
    const item = await regenerateItemContent(id, body.target);

    return Response.json({
      item: mapItemToFeedItem(item),
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
