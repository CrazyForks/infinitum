export const DAILY_REPORT_TIMEZONE = "Asia/Shanghai";

export const DAILY_REPORT_SECTION_NAMES = [
  "今日大事",
  "变更与实践",
  "安全与风险",
  "开源与工具",
  "数据与洞察",
] as const;

export type DailyReportSectionName = (typeof DAILY_REPORT_SECTION_NAMES)[number];

export type DailyReportStatus = "draft" | "published" | "failed";

export type DailyReportCandidate = {
  id: number;
  sourceKey: string;
  itemId: string;
  clusterId: string | null;
  title: string;
  sourceName: string;
  url: string;
  summary: string;
  qualityScore: number;
  candidateScore: number;
  sourceCount: number;
  itemCount: number;
  createdAt: string;
  publishedAt: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

export type DailyReportTopItem = {
  topic: string;
  summary: string;
  whyImportant: string;
  sourceIds: number[];
};

export type DailyReportActionItem = {
  topic: string;
  action: string;
  sourceIds: number[];
};

export type DailyReportRiskItem = {
  topic: string;
  affected: string;
  action: string;
  sourceIds: number[];
};

export type DailyReportToolItem = {
  topic: string;
  reason: string;
  sourceIds: number[];
};

export type DailyReportInsightItem = {
  topic: string;
  keyNumbers: string;
  reason: string;
  sourceIds: number[];
};

export type DailyReportContent = {
  openingSummary: string;
  sections: {
    今日大事: DailyReportTopItem[];
    变更与实践: DailyReportActionItem[];
    安全与风险: DailyReportRiskItem[];
    开源与工具: DailyReportToolItem[];
    数据与洞察: DailyReportInsightItem[];
  };
  closingThought: string;
};

export type DailyReportSourceDTO = {
  id: string;
  sourceNumber: number | null;
  sourceSummary: string | null;
  sourceQualityScore: number | null;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  sectionName: string | null;
  topic: string | null;
};

export type DailyReportSourceRegistryEntry = {
  sourceNumber: number;
  sourceKey: string;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  qualityScore: number | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

export type DailyReportRefineMode = "chat" | "generate";

export type DailyReportRefineStreamEvent =
  | { event: "session"; sessionId: string; reportDate: string; sourceRegistryVersion: string }
  | { event: "message_delta"; text: string }
  | { event: "message_done"; messageId: string }
  | { event: "candidate"; messageId: string; content: DailyReportContent; renderedMarkdown: string }
  | { event: "error"; code: string; message: string }
  | { event: "done"; ok: boolean };

export type DailyReportRefinementSourceSearchResult = Omit<DailyReportSourceRegistryEntry, "sourceNumber"> & {
  candidateNumber: number;
};

export type DailyReportListItemDTO = {
  id: string;
  date: string;
  timezone: string;
  status: DailyReportStatus;
  title: string;
  openingSummary: string;
  sourceCount: number;
  generatedAt: string;
  publishedAt: string | null;
  errorMessage: string | null;
};

export type DailyReportDetailDTO = DailyReportListItemDTO & {
  closingThought: string;
  content: DailyReportContent;
  renderedMarkdown: string;
  sources: DailyReportSourceDTO[];
  previous: { date: string; title: string } | null;
  next: { date: string; title: string } | null;
};

export type DailyReportArchiveWeekDTO = {
  key: string;
  label: string;
  count: number;
};
