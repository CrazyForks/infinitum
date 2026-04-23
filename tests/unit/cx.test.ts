import { describe, expect, it } from "vitest";

import { cx } from "@/lib/ui/cx";

describe("cx", () => {
  it("merges conflicting Tailwind utility classes by keeping the last one", () => {
    expect(cx("px-2 py-2", "px-4", { "bg-blue-500": true, "bg-slate-100": false }, ["bg-red-500", "bg-blue-500"])).toBe(
      "py-2 px-4 bg-blue-500",
    );
  });
});
