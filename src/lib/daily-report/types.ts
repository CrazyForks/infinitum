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
  itemId: string;
  clusterId: string | null;
  title: string;
  sourceName: string;
  url: string;
  summary: string;
  qualityScore: number;
  createdAt: string;
  publishedAt: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
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
  urgency: "low" | "medium" | "high";
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
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  sectionName: string | null;
  topic: string | null;
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
