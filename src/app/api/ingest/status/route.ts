import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import {
  countDisplayItemsCreatedDuringFetchRun,
  getLatestFetchRun,
  toFetchRunSnapshot,
} from "@/lib/feed/repository";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return adminErrorResponse(error, 401, "Unauthorized");
  }

  const latestRun = await getLatestFetchRun();
  const itemsAdded = latestRun ? await countDisplayItemsCreatedDuringFetchRun(latestRun) : null;

  return Response.json({
    run: latestRun ? toFetchRunSnapshot(latestRun, { itemsAdded: itemsAdded ?? undefined }) : null,
  });
}
