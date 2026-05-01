import type { ClusterDTO } from "@/lib/feed/types";

export function getClusterDisplayTitle(cluster: ClusterDTO) {
  if (cluster.itemCount === 1 && cluster.items[0]) {
    return cluster.items[0].originalTitle ?? cluster.items[0].title;
  }

  return cluster.title;
}
