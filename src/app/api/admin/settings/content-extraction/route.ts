import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { updateContentExtractionConfig } from "@/lib/settings/service";

const contentExtractionSchema = z
  .object({
    jinaEnabled: z.boolean(),
    jinaBaseUrl: z.string().trim().min(1),
    jinaApiKey: z.string().optional().default(""),
    jinaApiKeyMode: z.enum(["replace", "clear", "keep"]).optional().default("keep"),
    timeoutMs: z.number().int(),
    concurrency: z.number().int(),
    rpmLimit: z.number().int(),
    maxPerRun: z.number().int(),
    minChars: z.number().int(),
    maxChars: z.number().int(),
  })
  .strict();

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = contentExtractionSchema.parse(await request.json());
    const config = await updateContentExtractionConfig(body);

    return Response.json({ config });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
