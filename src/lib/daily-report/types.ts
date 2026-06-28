export const DAILY_REPORT_TIMEZONE = "Asia/Shanghai";

export const DEFAULT_OPENING_LABEL = "摘要";
export const DEFAULT_CLOSING_LABEL = "趋势观察";

export const DAILY_REPORT_OPENING_LABEL_MAX_LENGTH = 20;
export const DAILY_REPORT_CLOSING_LABEL_MAX_LENGTH = 20;
export const DAILY_REPORT_TITLE_MAX_LENGTH = 64;
export const DAILY_REPORT_HEADLINE_MAX_LENGTH = 48;

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

export type RecentDailyReportTopic = {
  date: string;
  sourceNumber: number | null;
  sectionName: string | null;
  topic: string | null;
  title: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

export type DailyReportTextBlock = {
  type: "text";
  title: string;
  body: string;
};

export type DailyReportItemNote = {
  label: string;
  text: string;
};

export type DailyReportItem = {
  title: string;
  body: string;
  notes?: DailyReportItemNote[];
  sourceIds: number[];
};

export type DailyReportSectionBlock = {
  type: "section";
  title: string;
  items: DailyReportItem[];
};

export type DailyReportBlock = DailyReportTextBlock | DailyReportSectionBlock;

export type DailyReportContent = {
  headline?: string;
  blocks: DailyReportBlock[];
  openingLabel?: string;
  openingSummary?: string;
  sections?: Record<string, DailyReportItem[]>;
  closingLabel?: string;
  closingThought?: string;
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
