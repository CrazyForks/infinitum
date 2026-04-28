import type { ClusterDTO, ReviewItemDTO } from "@/lib/feed/types";

export type RequiredActionField = "cluster" | "taskRun";

export type ContentReviewActionPayload = {
  item?: ReviewItemDTO;
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

export async function fetchFilteredReviewItems(page = 1, pageSize = 10) {
  const response = await fetch(`/api/admin/items?moderationStatus=filtered&page=${page}&pageSize=${pageSize}`);
  const payload = await parseJsonResponse<CollectionPayload>(response, "审核数据加载失败。");
  return { items: payload.items ?? [], total: payload.total ?? 0 };
}

export async function fetchReviewClusters(page = 1, pageSize = 10) {
  const response = await fetch(`/api/admin/clusters?page=${page}&pageSize=${pageSize}`);
  const payload = await parseJsonResponse<CollectionPayload>(response, "审核数据加载失败。");
  return { clusters: payload.clusters ?? [], total: payload.total ?? 0 };
}

export async function fetchAdminCluster(clusterId: string) {
  const response = await fetch(`/api/admin/clusters/${clusterId}`);
  const payload = await parseJsonResponse<ContentReviewActionPayload>(response, "聚合详情加载失败。");
  return payload.cluster ?? null;
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
