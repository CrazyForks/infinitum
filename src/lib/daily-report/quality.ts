import { DAILY_REPORT_SECTION_NAMES, type DailyReportContent } from "@/lib/daily-report/types";
import { prisma } from "@/lib/db";

export type CandidateSnapshotEntry = {
  id: number;
  itemId: string | null;
  clusterId: string | null;
  title: string;
  sourceName: string;
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

function parseContentSafely(json: string): DailyReportContent | null {
  try {
    return JSON.parse(json) as DailyReportContent;
  } catch {
    return null;
  }
}

function parseSnapshotSafely(json: string | null): CandidateSnapshotEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed as CandidateSnapshotEntry[] : [];
  } catch {
    return [];
  }
}

function computeSectionFillRate(reports: ReportWithRelations[]): SectionFillRateBucket[] {
  const buckets: Record<string, { counts: number[]; distribution: Record<number, number> }> = {};
  for (const name of DAILY_REPORT_SECTION_NAMES) {
    buckets[name] = { counts: [], distribution: {} };
  }
  for (const report of reports) {
    const content = parseContentSafely(report.summaryJson);
    if (!content) continue;
    for (const name of DAILY_REPORT_SECTION_NAMES) {
      const count = content.sections[name]?.length ?? 0;
      const bucket = buckets[name];
      bucket.counts.push(count);
      bucket.distribution[count] = (bucket.distribution[count] ?? 0) + 1;
    }
  }
  return DAILY_REPORT_SECTION_NAMES.map((name) => {
    const { counts, distribution } = buckets[name];
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
    const candidates = parseSnapshotSafely(report.candidateSnapshot);
    if (candidates.length === 0) continue;
    reportsWithSnapshot += 1;
    const top20 = [...candidates].sort((a, b) => b.candidateScore - a.candidateScore).slice(0, 20);
    if (top20.length === 0) continue;
    const usedKeys = new Set<string>();
    for (const source of report.sources) {
      if (source.itemId) usedKeys.add(`item:${source.itemId}`);
      else if (source.clusterId) usedKeys.add(`cluster:${source.clusterId}`);
      else usedKeys.add(`url:${source.url.trim().toLowerCase()}`);
    }
    const candidateKeys = new Map<string, CandidateSnapshotEntry>();
    for (const candidate of candidates) {
      if (candidate.itemId) candidateKeys.set(`item:${candidate.itemId}`, candidate);
      else if (candidate.clusterId) candidateKeys.set(`cluster:${candidate.clusterId}`, candidate);
    }
    let missCount = 0;
    for (const top of top20) {
      const key = top.itemId ? `item:${top.itemId}` : top.clusterId ? `cluster:${top.clusterId}` : null;
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
        .map((s) => s.itemId ?? s.clusterId ?? `url:${s.url.trim().toLowerCase()}`)
        .filter((value): value is string => Boolean(value)),
    );
    const prevClusterIds = new Set(
      prev.sources.map((s) => s.clusterId).filter((value): value is string => Boolean(value)),
    );
    const currSourceIds = new Set(
      curr.sources
        .map((s) => s.itemId ?? s.clusterId ?? `url:${s.url.trim().toLowerCase()}`)
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
