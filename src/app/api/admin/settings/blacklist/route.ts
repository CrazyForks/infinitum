import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { replaceBlacklistKeywords } from "@/lib/settings/service";

const blacklistSchema = z.object({
  keywords: z.array(z.string()),
});

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = blacklistSchema.parse(await request.json());

    await replaceBlacklistKeywords(body.keywords);

    return Response.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
