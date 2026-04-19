import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageShell } from "@/components/ui/page-shell";

describe("PageShell", () => {
  it("uses the wider default content width outside workspace mode", () => {
    render(
      <PageShell>
        <div data-testid="page-shell-content">内容</div>
      </PageShell>,
    );

    const contentContainer = screen.getByTestId("page-shell-content").parentElement;

    expect(contentContainer).not.toBeNull();
    expect(contentContainer?.className).toContain("max-w-7xl");
  });

  it("keeps the workspace content width unchanged", () => {
    render(
      <PageShell contentWidth="workspace">
        <div data-testid="page-shell-content">内容</div>
      </PageShell>,
    );

    const contentContainer = screen.getByTestId("page-shell-content").parentElement;

    expect(contentContainer).not.toBeNull();
    expect(contentContainer?.className).toContain("max-w-[92rem]");
  });

  it("can hide the sidebar slot below xl to avoid empty mobile spacing", () => {
    render(
      <PageShell
        sidebarVisibility="xl"
        sidebar={<aside data-testid="page-shell-sidebar">侧栏</aside>}
      >
        <div data-testid="page-shell-content">内容</div>
      </PageShell>,
    );

    const sidebarContainer = screen.getByTestId("page-shell-sidebar").parentElement;

    expect(sidebarContainer).not.toBeNull();
    expect(sidebarContainer?.className).toContain("hidden");
    expect(sidebarContainer?.className).toContain("xl:block");
  });

  it("can align the sidebar slot to Lumina's lg two-column layout", () => {
    render(
      <PageShell
        sidebarVisibility="lg"
        sidebar={<aside data-testid="page-shell-sidebar">侧栏</aside>}
      >
        <div data-testid="page-shell-content">内容</div>
      </PageShell>,
    );

    const sidebarContainer = screen.getByTestId("page-shell-sidebar").parentElement;
    const layoutContainer = sidebarContainer?.parentElement;

    expect(sidebarContainer).not.toBeNull();
    expect(sidebarContainer?.className).toContain("hidden");
    expect(sidebarContainer?.className).toContain("lg:block");
    expect(sidebarContainer?.className).toContain("lg:w-56");
    expect(sidebarContainer?.className).not.toContain("lg:self-start");
    expect(layoutContainer?.className).toContain("lg:flex-row");
    expect(layoutContainer?.className).not.toContain("lg:items-start");
  });
});
