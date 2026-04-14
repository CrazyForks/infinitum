import type { AiProvider } from "@/lib/ai/provider";

type TaskAiUsageSnapshot = {
  actual: number;
  estimated: number;
};

export function createTaskAiUsageTracker(initialEstimated = 0) {
  const state: TaskAiUsageSnapshot = {
    actual: 0,
    estimated: Math.max(0, initialEstimated),
  };

  const syncEstimateFloor = () => {
    if (state.estimated < state.actual) {
      state.estimated = state.actual;
    }
  };

  return {
    snapshot(): TaskAiUsageSnapshot {
      return {
        actual: state.actual,
        estimated: state.estimated,
      };
    },
    setEstimated(value: number) {
      state.estimated = Math.max(0, value);
      syncEstimateFloor();
    },
    addEstimated(value: number) {
      state.estimated += Math.max(0, value);
      syncEstimateFloor();
    },
    wrapProvider(
      aiProvider: AiProvider,
      options?: {
        enrichContentEstimated?: boolean;
        summarizeClusterEstimated?: boolean;
        matchClusterCandidateEstimated?: boolean;
      },
    ): AiProvider {
      return {
        async enrichContent(inputText, metadata) {
          state.actual += 1;
          if (options?.enrichContentEstimated) {
            state.estimated += 1;
          }
          syncEstimateFloor();
          return aiProvider.enrichContent(inputText, metadata);
        },
        async summarizeCluster(inputText, metadata) {
          state.actual += 1;
          if (options?.summarizeClusterEstimated ?? true) {
            state.estimated += 1;
          }
          syncEstimateFloor();
          return aiProvider.summarizeCluster(inputText, metadata);
        },
        async matchClusterCandidate(inputText, metadata) {
          state.actual += 1;
          if (options?.matchClusterCandidateEstimated ?? true) {
            state.estimated += 1;
          }
          syncEstimateFloor();
          return aiProvider.matchClusterCandidate(inputText, metadata);
        },
      };
    },
  };
}
