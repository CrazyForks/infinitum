import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { addTagAlias } from "@/lib/tags/service";

const tagAliasSchema = z.object({
  tagId: z.string().min(1),
  aliasName: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = tagAliasSchema.parse(await request.json());

    return Response.json({
      alias: await addTagAlias(body),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
