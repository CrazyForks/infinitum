import { render, screen } from "@testing-library/react";
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
  it("renders the shared shell navigation, including the monitor tab, brand, and login action", () => {
    render(<GlobalHeader activeNav="home" isAdmin={false} />);

    expect(screen.getByRole("link", { name: /Infinitum/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "主页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "审核" })).toHaveAttribute("href", "/admin/content");
    expect(screen.getByRole("link", { name: "任务" })).toHaveAttribute("href", "/admin/monitor");
    expect(screen.getByRole("link", { name: "管理" })).toHaveAttribute("href", "/admin/settings");
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("renders the logout action for admin sessions", () => {
    render(<GlobalHeader activeNav="admin" isAdmin />);

    expect(screen.getByRole("button", { name: "登出" })).toBeInTheDocument();
  });

  it("marks the monitor tab active when requested", () => {
    render(<GlobalHeader activeNav="monitor" isAdmin />);

    expect(screen.getByRole("link", { name: "任务" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "管理" })).not.toHaveAttribute("aria-current", "page");
  });

  it("supports rendering with no active navigation item", () => {
    render(<GlobalHeader activeNav={null} isAdmin={false} />);

    expect(screen.getByRole("link", { name: "主页" })).not.toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "审核" })).not.toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "任务" })).not.toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "管理" })).not.toHaveAttribute("aria-current", "page");
  });
});
