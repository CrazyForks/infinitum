import type { BackgroundTaskRun } from "@prisma/client";

import { executeClusterSummaryTask } from "@/lib/clusters/service";
import { runIngestionTask } from "@/lib/ingestion/service";
import { executeItemReanalyzeTask, executeItemRegenerationTask } from "@/lib/items/service";

export async function executeTaskRun(taskRun: BackgroundTaskRun) {
  switch (taskRun.kind) {
    case "ingestion":
      await runIngestionTask(taskRun);
      return;
    case "item_regenerate_translation":
      await executeItemRegenerationTask(taskRun, "translation");
      return;
    case "item_regenerate_summary":
      await executeItemRegenerationTask(taskRun, "summary");
      return;
    case "item_reanalyze":
      await executeItemReanalyzeTask(taskRun);
      return;
    case "cluster_regenerate_summary":
      await executeClusterSummaryTask(taskRun);
      return;
  }
}
