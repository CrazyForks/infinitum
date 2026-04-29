import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { createSource } from "@/lib/settings/service";
import { prisma } from "@/lib/db";

const sourceSchema = z.object({
  name: z.string().min(1),
  rssUrl: z.url(),
  siteUrl: z.url(),
  enabled: z.boolean(),
  aiParsingEnabled: z.boolean().default(true),
  aggregationEnabled: z.boolean().default(true),
  groupId: z.string().nullable().optional(),
});

function parseOptionalInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = parseOptionalInt(searchParams.get("page"), 1);
    const pageSize = Math.min(100, parseOptionalInt(searchParams.get("pageSize"), 20));
    const search = searchParams.get("search")?.trim() ?? "";
    const enabled = searchParams.get("enabled");
    const groupId = searchParams.get("groupId");

    const where: Record<string, unknown> = {};
    if (enabled === "true") where.enabled = true;
    else if (enabled === "false") where.enabled = false;

    if (groupId === "__ungrouped__") {
      where.groupId = null;
    } else if (groupId) {
      where.groupId = groupId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { rssUrl: { contains: search } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [sources, total] = await Promise.all([
      prisma.source.findMany({
        where,
        include: { group: true },
        orderBy: [{ name: "asc" }],
        take: pageSize,
        skip,
      }),
      prisma.source.count({ where }),
    ]);

    // Fetch latest item timestamps for the current page of sources
    const latestItemsBySource = await prisma.item.groupBy({
      by: ["sourceId"],
      where: { sourceId: { in: sources.map((s) => s.id) } },
      _max: { createdAt: true },
    });
    const latestItemCreatedAtBySourceId = new Map(
      latestItemsBySource.map((entry) => [entry.sourceId, entry._max.createdAt]),
    );

    return Response.json({
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        rssUrl: source.rssUrl,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        aiParsingEnabled: source.aiParsingEnabled,
        aggregationEnabled: source.aggregationEnabled,
        groupId: source.groupId,
        groupName: source.group?.name ?? null,
        lastItemCreatedAt: latestItemCreatedAtBySourceId.get(source.id)?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = sourceSchema.parse(await request.json());
    const source = await createSource(body);

    return Response.json({ source }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
