export type AdminSettingsSnapshot = {
  appConfig: {
    ingestionItemConcurrency: number;
    modelApi: {
      baseURL: string;
      model: string;
      apiKeyMasked: string;
      hasApiKey: boolean;
    };
    prompts: {
      itemAnalysis: string;
      clusterSummary: string;
      clusterMatch: string;
    };
  };
  blacklistKeywords: string[];
  groups: Array<{
    id: string;
    name: string;
  }>;
  sources: Array<{
    id: string;
    name: string;
    rssUrl: string;
    siteUrl: string;
    enabled: boolean;
    fetchFullTextWhenMissing: boolean;
    groupId: string | null;
    groupName: string | null;
  }>;
};
