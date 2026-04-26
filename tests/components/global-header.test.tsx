import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

import { GlobalHeader } from "@/components/ui/global-header";

afterEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GlobalHeader", () => {
  it("renders the shared shell navigation, including the homepage and admin button", () => {
    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    expect(screen.getByRole("link", { name: /Infinitum/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/shawnxie94/infinitum",
    );
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "主页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("uses the widened shared header container width", () => {
    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    const header = screen.getByRole("navigation", { name: "主导航" }).closest("header");
    const headerContent = header?.firstElementChild;

    expect(headerContent).not.toBeNull();
    expect(headerContent?.className).toContain("max-w-7xl");
  });

  it("keeps the homepage header non-sticky to match the Lumina feed layout", () => {
    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    const header = screen.getByRole("navigation", { name: "主导航" }).closest("header");

    expect(header).not.toBeNull();
    expect(header?.className).not.toContain("sticky");
    expect(header?.className).not.toContain("top-0");
  });

  it("renders the logout action for admin sessions", () => {
    render(<GlobalHeader activeNav="admin" isAdmin />);

    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
  });

  it("renders the admin button for admin sessions", () => {
    render(<GlobalHeader activeNav="admin" isAdmin />);

    expect(screen.getByRole("link", { name: "管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute("href", "/admin");
  });

  it("supports rendering with no active navigation item", () => {
    render(<GlobalHeader activeNav={null} isAdmin={false} />);

    expect(screen.getByRole("link", { name: "主页" })).not.toHaveAttribute("aria-current", "page");
  });

  it("opens the default homepage rss feed without page filters", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    window.history.pushState({}, "", "/?range=today&title=Agent");

    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "RSS 订阅" }));

    expect(openMock).toHaveBeenCalledWith("/api/feed/rss", "_blank", "noopener,noreferrer");
  });

  it("opens the default daily rss feed without page filters", async () => {
    const user = userEvent.setup();
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    window.history.pushState({}, "", "/daily?week=2026-04-20");

    render(<GlobalHeader activeNav="daily" isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "RSS 订阅" }));

    expect(openMock).toHaveBeenCalledWith("/api/daily/rss", "_blank", "noopener,noreferrer");
  });
});
