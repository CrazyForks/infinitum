import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { reorderSourceGroups } from "@/lib/settings/service";

const reorderGroupsSchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = reorderGroupsSchema.parse(await request.json());
    const groups = await reorderSourceGroups(body.groupIds);

    return Response.json({ groups });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
