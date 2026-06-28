import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { reorderHeaderLinks } from "@/lib/settings/service";

const reorderHeaderLinksSchema = z.object({
  linkIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = reorderHeaderLinksSchema.parse(await request.json());
    const links = await reorderHeaderLinks(body.linkIds);

    return Response.json({ links });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
