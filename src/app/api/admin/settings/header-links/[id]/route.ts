import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { deleteHeaderLink, updateHeaderLink } from "@/lib/settings/service";

const headerLinkSchema = z.object({
  label: z.string().min(1).max(20),
  url: z.url(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  openInNewTab: z.boolean().default(true),
  rel: z.string().optional(),
});

type HeaderLinkRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: HeaderLinkRouteContext) {
  try {
    await requireAdmin();
    const body = headerLinkSchema.parse(await request.json());
    const { id } = await context.params;
    const link = await updateHeaderLink(id, body);

    return Response.json({ link });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: HeaderLinkRouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteHeaderLink(id);

    return Response.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
