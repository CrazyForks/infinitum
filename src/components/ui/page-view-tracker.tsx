"use client";

import { useEffect, useRef, useState } from "react";

export function PageViewTracker({ path }: { path: string }) {
  const tracked = useRef(false);
  const [stats, setStats] = useState<{ pv: number; uv: number } | null>(null);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    // Skip tracking in test environments
    if (process.env.NODE_ENV === "test") return;

    fetch("/api/track-page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => {
        // Silently fail — stats are non-critical
      });
  }, [path]);

  if (!stats) return null;

  return (
    <span className="text-sm text-[var(--text-3)]">
      pv：{stats.pv} uv：{stats.uv}
    </span>
  );
}
