import { getLatestFetchRun, toFetchRunSnapshot } from "@/lib/feed/repository";

export async function GET() {
  const latestRun = await getLatestFetchRun();

  return Response.json({
    run: latestRun ? toFetchRunSnapshot(latestRun) : null,
  });
}
