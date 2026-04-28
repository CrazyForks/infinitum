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

export function generateUniqueGroupColor(existingColors: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 55 + Math.floor(Math.random() * 16); // 55-70%
    const lightness = 45 + Math.floor(Math.random() * 11); // 45-55%
    const color = `hsl(${hue},${saturation}%,${lightness}%)`;

    if (!existingColors.has(color)) {
      return color;
    }
  }

  // Fallback: try palette colors not yet used
  for (const paletteColor of groupBadgePalette) {
    if (!existingColors.has(paletteColor)) {
      return paletteColor;
    }
  }

  // Last resort: return a palette color even if duplicate
  return groupBadgePalette[0];
}

export function toGroupBadge(
  group: { id: string; name: string; color?: string } | null | undefined,
): GroupBadge | null {
  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    color: group.color || getStableGroupBadgeColor(group.name),
  };
}
