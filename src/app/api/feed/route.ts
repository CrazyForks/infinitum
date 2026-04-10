import { listFeedItems } from "@/lib/feed/repository";
import { isFeedRange } from "@/lib/feed/range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "7d";
  const cursor = searchParams.get("cursor");
  const range = isFeedRange(rangeParam) ? rangeParam : "7d";
  const result = await listFeedItems(range, cursor);

  return Response.json({
    ...result,
    range,
  });
}
