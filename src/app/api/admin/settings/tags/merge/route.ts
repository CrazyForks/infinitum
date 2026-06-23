import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { mergeTags } from "@/lib/tags/service";

const tagMergeSchema = z.object({
  targetTagId: z.string().min(1),
  sourceTagIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = tagMergeSchema.parse(await request.json());

    return Response.json(await mergeTags(body));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
