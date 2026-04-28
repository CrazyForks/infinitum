import type { AiProvider } from "@/lib/ai/provider";
import type {
  TaskAiCallBreakdownKey,
  TaskAiCallBreakdownSnapshot,
} from "@/lib/tasks/types";

type TaskAiUsageSnapshot = {
  actual: number;
  estimated: number;
  breakdown: TaskAiCallBreakdownSnapshot[];
};

const AI_CALL_BREAKDOWN_LABELS: Record<TaskAiCallBreakdownKey, string> = {
  item_summary: "条目摘要",
  item_analysis: "内容分析",
  cluster_match: "聚合匹配",
  cluster_summary: "聚合摘要",
  cluster_merge: "聚合合并",
  daily_report: "AI 日报",
};

type TaskAiUsageBreakdownState = Record<TaskAiCallBreakdownKey, { actual: number; estimated: number }>;

function createEmptyBreakdownState(): TaskAiUsageBreakdownState {
  return {
    item_summary: { actual: 0, estimated: 0 },
    item_analysis: { actual: 0, estimated: 0 },
    cluster_match: { actual: 0, estimated: 0 },
    cluster_summary: { actual: 0, estimated: 0 },
    cluster_merge: { actual: 0, estimated: 0 },
    daily_report: { actual: 0, estimated: 0 },
  };
}

function toBreakdownSnapshot(state: TaskAiUsageBreakdownState): TaskAiCallBreakdownSnapshot[] {
  return (Object.keys(AI_CALL_BREAKDOWN_LABELS) as TaskAiCallBreakdownKey[]).map((key) => ({
    key,
    label: AI_CALL_BREAKDOWN_LABELS[key],
    actual: state[key].actual,
    estimated: state[key].estimated,
  }));
}

function sumBreakdown(state: TaskAiUsageBreakdownState, field: "actual" | "estimated") {
  return (Object.keys(state) as TaskAiCallBreakdownKey[]).reduce(
    (total, key) => total + state[key][field],
    0,
  );
}

export function createTaskAiUsageTracker(
  initialEstimated = 0,
  initialEstimatedKey: TaskAiCallBreakdownKey = "item_analysis",
) {
  const state: TaskAiUsageSnapshot = {
    actual: 0,
    estimated: Math.max(0, initialEstimated),
    breakdown: [],
  };
  const breakdownState = createEmptyBreakdownState();
  breakdownState[initialEstimatedKey].estimated = Math.max(0, initialEstimated);

  const syncSnapshot = () => {
    state.actual = sumBreakdown(breakdownState, "actual");
    state.estimated = sumBreakdown(breakdownState, "estimated");
    state.breakdown = toBreakdownSnapshot(breakdownState);
  };

  const syncEstimateFloor = () => {
    for (const key of Object.keys(breakdownState) as TaskAiCallBreakdownKey[]) {
      if (breakdownState[key].estimated < breakdownState[key].actual) {
        breakdownState[key].estimated = breakdownState[key].actual;
      }
    }
    syncSnapshot();
  };

  const incrementActual = (key: TaskAiCallBreakdownKey) => {
    breakdownState[key].actual += 1;
  };

  const incrementEstimated = (key: TaskAiCallBreakdownKey) => {
    breakdownState[key].estimated += 1;
  };

  syncSnapshot();

  return {
    snapshot(): TaskAiUsageSnapshot {
      return {
        actual: state.actual,
        estimated: state.estimated,
        breakdown: state.breakdown.map((entry) => ({ ...entry })),
      };
    },
    setEstimated(value: number, key: TaskAiCallBreakdownKey = "item_analysis") {
      breakdownState[key].estimated = Math.max(0, value);
      syncEstimateFloor();
    },
    addEstimated(value: number, key: TaskAiCallBreakdownKey = "item_analysis") {
      breakdownState[key].estimated += Math.max(0, value);
      syncEstimateFloor();
    },
    wrapProvider(
      aiProvider: AiProvider,
      options?: {
        summarizeItemEstimated?: boolean;
        enrichContentEstimated?: boolean;
        summarizeClusterEstimated?: boolean;
        matchClusterCandidateEstimated?: boolean;
      },
    ): AiProvider {
      return {
        async summarizeItem(inputText, metadata) {
          incrementActual("item_summary");
          if (options?.summarizeItemEstimated ?? true) {
            incrementEstimated("item_summary");
          }
          syncEstimateFloor();
          return aiProvider.summarizeItem(inputText, metadata);
        },
        async enrichContent(inputText, metadata) {
          incrementActual("item_analysis");
          if (options?.enrichContentEstimated) {
            incrementEstimated("item_analysis");
          }
          syncEstimateFloor();
          return aiProvider.enrichContent(inputText, metadata);
        },
        async summarizeCluster(inputText, metadata) {
          incrementActual("cluster_summary");
          if (options?.summarizeClusterEstimated ?? true) {
            incrementEstimated("cluster_summary");
          }
          syncEstimateFloor();
          return aiProvider.summarizeCluster(inputText, metadata);
        },
        async matchClusterCandidate(inputText, metadata) {
          incrementActual("cluster_match");
          if (options?.matchClusterCandidateEstimated ?? true) {
            incrementEstimated("cluster_match");
          }
          syncEstimateFloor();
          return aiProvider.matchClusterCandidate(inputText, metadata);
        },
        async mergeClusters(clustersJson) {
          incrementActual("cluster_merge");
          incrementEstimated("cluster_merge");
          syncEstimateFloor();
          return aiProvider.mergeClusters(clustersJson);
        },
        async generateDailyReport(input) {
          incrementActual("daily_report");
          incrementEstimated("daily_report");
          syncEstimateFloor();
          return aiProvider.generateDailyReport(input);
        },
        async repairDailyReportJson(rawContent) {
          incrementActual("daily_report");
          syncEstimateFloor();
          return aiProvider.repairDailyReportJson(rawContent);
        },
      };
    },
  };
}
