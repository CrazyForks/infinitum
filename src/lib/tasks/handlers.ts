import type { BackgroundTaskRun } from "@prisma/client";

import { runIngestionTask } from "@/lib/ingestion/service";

export async function executeTaskRun(_taskRun: BackgroundTaskRun) {
  if (_taskRun.kind === "ingestion") {
    await runIngestionTask(_taskRun);
  }
}
