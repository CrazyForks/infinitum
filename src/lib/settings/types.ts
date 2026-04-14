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

export type ResolvedSourceMetadata = {
  name: string;
  rssUrl: string;
  siteUrl: string;
};

export type OpmlImportFailure = {
  rssUrl: string | null;
  message: string;
};

export type OpmlImportSummary = {
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  failures: OpmlImportFailure[];
};
