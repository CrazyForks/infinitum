import type { DailyReportContent, DailyReportItem } from "@/lib/daily-report/types";
import { getDailyReportSectionBlocks, normalizeDailyReportContent } from "@/lib/daily-report/content";
import { prisma } from "@/lib/db";

export type CandidateSnapshotEntry = {
  id: number;
  itemId: string | null;
  clusterId: string | null;
  title: string;
  sourceName: string;
  url: string;
  candidateScore: number;
  sourceCount: number;
  itemCount: number;
  eventType: string | null;
  eventSubject: string | null;
};

export type SectionFillRateBucket = {
  sectionName: string;
  avgCount: number;
  distribution: Record<number, number>;
  maxFillRate: number;
  reportCount: number;
};

export type SourceDiversityStat = {
  avgSourceCountPerReport: number;
  topSources: Array<{ sourceName: string; reportCount: number; sharePercent: number }>;
};

export type MissedCandidateSample = {
  date: string;
  candidateId: number;
  title: string;
  sourceName: string;
  candidateScore: number;
  sourceCount: number;
};

export type MissRateStat = {
  reportsWithSnapshot: number;
  reportsEvaluated: number;
  avgTop20MissRate: number;
  recentMissed: MissedCandidateSample[];
};

export type DayOverlapStat = {
  pairsComputed: number;
  avgSourceOverlap: number;
  avgClusterOverlap: number;
};

export type RefinementDeltaStat = {
  reportsWithSession: number;
  reportsRefined: number;
  refinedRate: number;
  avgMessagesPerReport: number;
};

export type DailyReportQualityMetrics = {
  range: { from: string; to: string; days: number };
  reportCount: number;
  sectionFillRate: SectionFillRateBucket[];
  sourceDiversity: SourceDiversityStat;
  missRate: MissRateStat;
  dayOverlap: DayOverlapStat;
  refinementDelta: RefinementDeltaStat;
};

type ReportWithRelations = {
  id: string;
  date: string;
  status: string;
  summaryJson: string;
  candidateSnapshot: string | null;
  sources: Array<{
    sourceName: string;
    itemId: string | null;
    clusterId: string | null;
    url: string;
  }>;
  refinementSessions: Array<{
    baseContentJson: string;
    currentDraftJson: string;
    messages: Array<{ id: string }>;
  }>;
};

function getDateRange(days: number, now = new Date()) {
  const to = new Date(now);
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    days,
  };
}

function parseContentSafely(json: string, label: string): DailyReportContent | null {
  try {
    return normalizeDailyReportContent(JSON.parse(json));
  } catch (error) {
    console.warn(`[daily-report-quality] failed to parse summaryJson for ${label}:`, error);
    return null;
  }
}

function parseSnapshotSafely(json: string | null, label: string): CandidateSnapshotEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed as CandidateSnapshotEntry[] : [];
  } catch (error) {
    console.warn(`[daily-report-quality] failed to parse candidateSnapshot for ${label}:`, error);
    return [];
  }
}

function buildKey(input: { itemId: string | null; clusterId: string | null; url: string | null | undefined }): string | null {
  if (input.itemId) return `item:${input.itemId}`;
  if (input.clusterId) return `cluster:${input.clusterId}`;
  if (input.url) return `url:${input.url.trim().toLowerCase()}`;
  return null;
}
function collectSections(content: DailyReportContent): Array<[string, DailyReportItem[]]> {
  return getDailyReportSectionBlocks(content).map((section) => [section.title, section.items]);
}

function computeSectionFillRate(reports: ReportWithRelations[]): SectionFillRateBucket[] {
  const buckets: Record<string, { counts: number[]; distribution: Record<number, number> }> = {};
  for (const report of reports) {
    const content = parseContentSafely(report.summaryJson, `report ${report.date} (${report.id})`);
    if (!content) continue;
    for (const [name, items] of collectSections(content)) {
      const bucket = buckets[name] ?? { counts: [], distribution: {} };
      const count = items.length;
      bucket.counts.push(count);
      bucket.distribution[count] = (bucket.distribution[count] ?? 0) + 1;
      buckets[name] = bucket;
    }
  }
  return Object.entries(buckets).map(([name, { counts, distribution }]) => {
    const reportCount = counts.length;
    const avgCount = reportCount > 0 ? counts.reduce((sum, n) => sum + n, 0) / reportCount : 0;
    const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
    const maxFillCount = counts.filter((n) => n === maxCount && n > 0).length;
    const maxFillRate = reportCount > 0 ? maxFillCount / reportCount : 0;
    return {
      sectionName: name,
      avgCount: Math.round(avgCount * 100) / 100,
      distribution,
      maxFillRate: Math.round(maxFillRate * 1000) / 1000,
      reportCount,
    };
  });
}

function computeSourceDiversity(reports: ReportWithRelations[]): SourceDiversityStat {
  if (reports.length === 0) {
    return { avgSourceCountPerReport: 0, topSources: [] };
  }
  let totalSourceCount = 0;
  const sourceReportCount = new Map<string, number>();
  for (const report of reports) {
    const distinctSources = new Set(report.sources.map((s) => s.sourceName));
    totalSourceCount += distinctSources.size;
    for (const name of distinctSources) {
      sourceReportCount.set(name, (sourceReportCount.get(name) ?? 0) + 1);
    }
  }
  const topSources = [...sourceReportCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sourceName, count]) => ({
      sourceName,
      reportCount: count,
      sharePercent: Math.round((count / reports.length) * 1000) / 10,
    }));
  return {
    avgSourceCountPerReport: Math.round((totalSourceCount / reports.length) * 100) / 100,
    topSources,
  };
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeMissRate(reports: ReportWithRelations[]): MissRateStat {
  const recentMissed: MissedCandidateSample[] = [];
  let totalMissRate = 0;
  let reportsEvaluated = 0;
  let reportsWithSnapshot = 0;
  for (const report of reports) {
    const candidates = parseSnapshotSafely(report.candidateSnapshot, `report ${report.date} (${report.id})`);
    if (candidates.length === 0) continue;
    reportsWithSnapshot += 1;
    const top20 = [...candidates].sort((a, b) => b.candidateScore - a.candidateScore).slice(0, 20);
    if (top20.length === 0) continue;
    const usedKeys = new Set<string>();
    for (const source of report.sources) {
      const key = buildKey({ itemId: source.itemId, clusterId: source.clusterId, url: source.url });
      if (key) usedKeys.add(key);
    }
    const candidateKeys = new Map<string, CandidateSnapshotEntry>();
    for (const candidate of candidates) {
      const key = buildKey({ itemId: candidate.itemId, clusterId: candidate.clusterId, url: candidate.url });
      if (key) candidateKeys.set(key, candidate);
    }
    let missCount = 0;
    for (const top of top20) {
      const key = buildKey({ itemId: top.itemId, clusterId: top.clusterId, url: top.url });
      if (!key) continue;
      if (!usedKeys.has(key)) {
        missCount += 1;
        if (recentMissed.length < 10) {
          recentMissed.push({
            date: report.date,
            candidateId: top.id,
            title: top.title,
            sourceName: top.sourceName,
            candidateScore: top.candidateScore,
            sourceCount: top.sourceCount,
          });
        }
      }
    }
    totalMissRate += missCount / top20.length;
    reportsEvaluated += 1;
  }
  return {
    reportsWithSnapshot,
    reportsEvaluated,
    avgTop20MissRate: reportsEvaluated > 0 ? Math.round((totalMissRate / reportsEvaluated) * 1000) / 1000 : 0,
    recentMissed,
  };
}

function computeDayOverlap(reports: ReportWithRelations[]): DayOverlapStat {
  if (reports.length < 2) {
    return { pairsComputed: 0, avgSourceOverlap: 0, avgClusterOverlap: 0 };
  }
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  let totalSource = 0;
  let totalCluster = 0;
  let pairs = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevSourceIds = new Set(
      prev.sources
        .map((s) => buildKey({ itemId: s.itemId, clusterId: s.clusterId, url: s.url }))
        .filter((value): value is string => Boolean(value)),
    );
    const prevClusterIds = new Set(
      prev.sources.map((s) => s.clusterId).filter((value): value is string => Boolean(value)),
    );
    const currSourceIds = new Set(
      curr.sources
        .map((s) => buildKey({ itemId: s.itemId, clusterId: s.clusterId, url: s.url }))
        .filter((value): value is string => Boolean(value)),
    );
    const currClusterIds = new Set(
      curr.sources.map((s) => s.clusterId).filter((value): value is string => Boolean(value)),
    );
    totalSource += jaccard(prevSourceIds, currSourceIds);
    totalCluster += jaccard(prevClusterIds, currClusterIds);
    pairs += 1;
  }
  return {
    pairsComputed: pairs,
    avgSourceOverlap: pairs > 0 ? Math.round((totalSource / pairs) * 1000) / 1000 : 0,
    avgClusterOverlap: pairs > 0 ? Math.round((totalCluster / pairs) * 1000) / 1000 : 0,
  };
}

function computeRefinementDelta(reports: ReportWithRelations[]): RefinementDeltaStat {
  let reportsWithSession = 0;
  let reportsRefined = 0;
  let totalMessages = 0;
  for (const report of reports) {
    const session = report.refinementSessions[0];
    if (!session) continue;
    reportsWithSession += 1;
    totalMessages += session.messages.length;
    if (session.baseContentJson !== session.currentDraftJson) {
      reportsRefined += 1;
    }
  }
  return {
    reportsWithSession,
    reportsRefined,
    refinedRate: reportsWithSession > 0 ? Math.round((reportsRefined / reportsWithSession) * 1000) / 1000 : 0,
    avgMessagesPerReport: reportsWithSession > 0 ? Math.round((totalMessages / reportsWithSession) * 100) / 100 : 0,
  };
}

export async function getDailyReportQualityMetrics(input: { days: number; now?: Date }): Promise<DailyReportQualityMetrics> {
  const days = Math.max(1, Math.min(180, Math.floor(input.days)));
  const { from, to } = getDateRange(days, input.now);

  const reports = await prisma.dailyReport.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { not: "failed" },
    },
    orderBy: [{ date: "asc" }, { generatedAt: "desc" }],
    select: {
      id: true,
      date: true,
      status: true,
      summaryJson: true,
      candidateSnapshot: true,
      sources: {
        select: { sourceName: true, itemId: true, clusterId: true, url: true },
      },
      refinementSessions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          baseContentJson: true,
          currentDraftJson: true,
          messages: { select: { id: true } },
        },
      },
    },
  });

  const typedReports = reports as unknown as ReportWithRelations[];

  return {
    range: { from, to, days },
    reportCount: typedReports.length,
    sectionFillRate: computeSectionFillRate(typedReports),
    sourceDiversity: computeSourceDiversity(typedReports),
    missRate: computeMissRate(typedReports),
    dayOverlap: computeDayOverlap(typedReports),
    refinementDelta: computeRefinementDelta(typedReports),
  };
}
