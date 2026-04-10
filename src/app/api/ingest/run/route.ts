import { hasActiveFetchRun } from "@/lib/feed/repository";
import { toFetchRunSnapshot } from "@/lib/feed/repository";
import { startIngestion } from "@/lib/ingestion/service";

export async function POST() {
  if (await hasActiveFetchRun()) {
    return Response.json(
      {
        error: "An ingestion run is already in progress.",
      },
      { status: 409 },
    );
  }

  const run = await startIngestion({ trigger: "manual" });

  return Response.json(
    {
      run: toFetchRunSnapshot(run),
    },
    { status: 202 },
  );
}
