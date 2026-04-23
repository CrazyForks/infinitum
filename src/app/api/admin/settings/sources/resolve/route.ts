import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { resolveSourceMetadata } from "@/lib/settings/service";

const resolveSchema = z.object({
  rssUrl: z.url(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = resolveSchema.parse(await request.json());
    const source = await resolveSourceMetadata(body.rssUrl);

    return Response.json({ source });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
