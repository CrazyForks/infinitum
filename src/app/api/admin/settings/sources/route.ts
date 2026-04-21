import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { createSource } from "@/lib/settings/service";

const sourceSchema = z.object({
  name: z.string().min(1),
  rssUrl: z.url(),
  siteUrl: z.url(),
  enabled: z.boolean(),
  aiParsingEnabled: z.boolean().default(true),
  groupId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = sourceSchema.parse(await request.json());
    const source = await createSource(body);

    return Response.json({ source }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
