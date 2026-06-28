import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { createHeaderLink, listAdminHeaderLinks } from "@/lib/settings/service";

const headerLinkSchema = z.object({
  label: z.string().min(1).max(20),
  url: z.url(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  openInNewTab: z.boolean().default(true),
  rel: z.string().optional(),
});

export async function GET() {
  try {
    await requireAdmin();

    return Response.json({ links: await listAdminHeaderLinks() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = headerLinkSchema.parse(await request.json());
    const link = await createHeaderLink(body);

    return Response.json({ link }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
