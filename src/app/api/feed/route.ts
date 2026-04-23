import { cookies } from "next/headers";
import { resolveFeedRequest } from "@/lib/feed/request";
import { getCachedFeedItems } from "@/lib/feed/service";

async function getVisitorIdCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    let visitorId = cookieStore.get("visitorId")?.value;
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      cookieStore.set("visitorId", visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
    return visitorId;
  } catch {
    // In test environment or when cookies() is not available
    return undefined;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { filters, pagination } = resolveFeedRequest(searchParams);
  const visitorId = await getVisitorIdCookie();
  const result = await getCachedFeedItems(filters, pagination, visitorId);

  return Response.json({
    ...result,
    range: filters.range,
    sort: filters.sort,
    start: filters.start,
    end: filters.end,
    groupId: filters.groupId,
    sourceId: filters.sourceId,
    title: filters.title,
  });
}
