export type GroupBadge = {
  id: string;
  name: string;
  color: string;
};

const groupBadgePalette = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f97316",
] as const;

export function getStableGroupBadgeColor(groupName: string) {
  const normalized = groupName.trim().toLowerCase();

  if (!normalized) {
    return groupBadgePalette[0];
  }

  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return groupBadgePalette[hash % groupBadgePalette.length];
}

export function toGroupBadge(group: { id: string; name: string } | null | undefined): GroupBadge | null {
  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    color: getStableGroupBadgeColor(group.name),
  };
}
