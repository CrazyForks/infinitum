import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { dismissTagSuggestion, listAdminTagSuggestions } from "@/lib/tags/service";

const tagSuggestionQuerySchema = z.object({
  search: z.string().nullable().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const tagSuggestionDecisionSchema = z.object({
  sourceTagId: z.string().min(1),
  targetTagId: z.string().min(1),
  decision: z.enum(["ignored", "kept"]),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const query = tagSuggestionQuerySchema.parse({
      search: searchParams.get("search"),
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    return Response.json(await listAdminTagSuggestions(query));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = tagSuggestionDecisionSchema.parse(await request.json());

    return Response.json(await dismissTagSuggestion(body));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
