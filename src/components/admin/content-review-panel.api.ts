import type { AggregationSplitParentDTO, ClusterDTO, ReviewItemDTO } from "@/lib/feed/types";

export type RequiredActionField = "cluster" | "taskRun";

export type ContentReviewActionPayload = {
  success?: boolean;
  item?: ReviewItemDTO;
  aggregationSplit?: AggregationSplitParentDTO;
  cluster?: ClusterDTO | null;
  taskRun?: { id: string; kind?: string };
  error?: string;
};

export type MergeClustersResult = {
  targetClusterId: string;
  mergedClusterIds: string[];
  itemsMoved: number;
  taskId: string;
};

type CollectionPayload = {
  aggregationSplits?: AggregationSplitParentDTO[];
  clusters?: ClusterDTO[];
  error?: string;
  items?: ReviewItemDTO[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type MergeClustersPayload = {
  success?: boolean;
  result?: MergeClustersResult;
  error?: string;
};

export function getResponseError(
  response: Response,
  payload: {
    error?: string;
  },
  fallbackMessage: string,
) {
  if (!response.ok) {
    return payload.error ?? fallbackMessage;
  }
  return payload.error ?? null;
}

async function parseJsonResponse<T extends { error?: string }>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = (await response.json()) as T;
  const responseError = getResponseError(response, payload, fallbackMessage);

  if (responseError) {
    throw new Error(responseError);
  }

  return payload;
}

export async function fetchFilteredReviewItems(
  page = 1,
  pageSize = 10,
  filters?: { search?: string; sourceName?: string; reason?: string },
) {
  const params = new URLSearchParams({
    moderationStatus: "filtered",
    page: String(page),
    pageSize: String(pageSize),
  });
  const normalizedSearch = filters?.search?.trim();
  const normalizedSourceName = filters?.sourceName?.trim();
  const normalizedReason = filters?.reason?.trim();

  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  if (normalizedSourceName) {
    params.set("sourceName", normalizedSourceName);
  }
  if (normalizedReason) {
    params.set("reason", normalizedReason);
  }

  const response = await fetch(`/api/admin/items?${params.toString()}`);
  const payload = await parseJsonResponse<CollectionPayload>(response, "审核数据加载失败。");
  return { items: payload.items ?? [], total: payload.total ?? 0 };
}

export async function fetchReviewClusters(
  page = 1,
  pageSize = 10,
  search = "",
  options?: {
    minItemCount?: number | null;
    status?: string;
    timeRange?: string;
  },
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const normalizedSearch = search.trim();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  if (typeof options?.minItemCount === "number") {
    params.set("minItemCount", String(options.minItemCount));
  }
  if (options?.status) {
    params.set("status", options.status);
  }
  if (options?.timeRange) {
    params.set("timeRange", options.timeRange);
  }

  const response = await fetch(`/api/admin/clusters?${params.toString()}`);
  const payload = await parseJsonResponse<CollectionPayload>(response, "审核数据加载失败。");
  return { clusters: payload.clusters ?? [], total: payload.total ?? 0 };
}

export async function fetchAdminCluster(clusterId: string) {
  const response = await fetch(`/api/admin/clusters/${clusterId}`);
  const payload = await parseJsonResponse<ContentReviewActionPayload>(response, "聚合详情加载失败。");
  return payload.cluster ?? null;
}

export async function fetchAggregationSplits(
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const normalizedSearch = search.trim();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  if (status) {
    params.set("status", status);
  }

  const response = await fetch(`/api/admin/items/aggregation?${params.toString()}`);
  const payload = await parseJsonResponse<CollectionPayload>(response, "拆分数据加载失败。");
  return { items: payload.aggregationSplits ?? [], total: payload.total ?? 0 };
}

export async function fetchAggregationSplitDetail(parentItemId: string) {
  const response = await fetch(`/api/admin/items/aggregation/${parentItemId}`);
  const payload = await parseJsonResponse<ContentReviewActionPayload>(response, "拆分详情加载失败。");
  return payload.aggregationSplit ?? null;
}

export async function postContentReviewAction(url: string) {
  const response = await fetch(url, { method: "POST" });
  return parseJsonResponse<ContentReviewActionPayload>(response, "操作失败");
}

export async function mergeReviewClusters(input: {
  targetClusterId: string;
  sourceClusterIds: string[];
}) {
  const response = await fetch("/api/admin/clusters/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJsonResponse<MergeClustersPayload>(response, "合并失败");

  if (!payload.result) {
    throw new Error("合并失败");
  }

  return payload.result;
}
