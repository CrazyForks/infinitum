"use client";

import { useEffect, useState } from "react";

import { IconArrowUp } from "@/components/ui/icons";
import { cx } from "@/lib/ui/cx";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > 420);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  return (
    <button
      type="button"
      aria-label="回到顶部"
      title="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cx(
        "fixed bottom-8 right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-2)] shadow-[var(--shadow-lg)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <IconArrowUp className="h-4 w-4" />
    </button>
  );
}
