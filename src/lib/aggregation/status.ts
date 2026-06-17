export const AGGREGATION_PARSE_STATUS = {
  detected: "detected",
  parsed: "parsed",
  notAggregation: "not_aggregation",
  failed: "failed",
  manualCancelled: "manual_cancelled",
} as const;

export type AggregationParseStatus =
  (typeof AGGREGATION_PARSE_STATUS)[keyof typeof AGGREGATION_PARSE_STATUS];

export const RETRIABLE_AGGREGATION_PARSE_STATUSES: AggregationParseStatus[] = [
  AGGREGATION_PARSE_STATUS.detected,
  AGGREGATION_PARSE_STATUS.failed,
];
