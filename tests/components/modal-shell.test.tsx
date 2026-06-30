import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ModalShell } from "@/components/ui/modal-shell";

function getOverlayZIndex(dialogName: string) {
  const dialog = screen.getByRole("dialog", { name: dialogName });
  const overlay = dialog.parentElement;

  expect(overlay).not.toBeNull();
  return Number(overlay?.style.zIndex ?? 0);
}

function NestedModalHarness() {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(true);

  return (
    <>
      <ModalShell
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="聚合详情"
      >
        详情内容
      </ModalShell>
      <ModalShell
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        title="聚合待定"
      >
        <button type="button" onClick={() => setIsDetailOpen(true)}>
          打开详情
        </button>
      </ModalShell>
    </>
  );
}

describe("ModalShell", () => {
  it("puts a later-opened modal above an already open modal even when it renders earlier", async () => {
    const user = userEvent.setup();

    render(<NestedModalHarness />);

    const reviewDialog = screen.getByRole("dialog", { name: "聚合待定" });
    await user.click(within(reviewDialog).getByRole("button", { name: "打开详情" }));

    expect(getOverlayZIndex("聚合详情")).toBeGreaterThan(getOverlayZIndex("聚合待定"));
  });
});
