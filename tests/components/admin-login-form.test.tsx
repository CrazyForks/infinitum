import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminLoginForm } from "@/components/admin/admin-login-form";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminLoginForm", () => {
  it("renders the new console shell before login", () => {
    render(<AdminLoginForm />);

    expect(screen.getByText("Infinitum Console")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "管理员登录" })).toBeInTheDocument();
    expect(screen.getByText("后台访问受密码保护，登录后可管理抓取、审核与配置。")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "管理员登录" })).not.toHaveClass("font-display");
    expect(screen.getByRole("button", { name: "登录" })).not.toHaveClass("font-mono");
  });

  it("shows an error message when login fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Invalid password",
        }),
        { status: 401 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("管理员密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "wrong-password" }),
      });
    });

    expect(await screen.findByText("Invalid password")).toBeInTheDocument();
  });

  it("submits the login form when pressing Enter in the password field", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
        }),
        { status: 200 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("管理员密码"), "correct-password{enter}");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "correct-password" }),
      });
    });
  });

  it("shows a stable fallback message when the login request throws unexpectedly", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("管理员密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("登录失败")).toBeInTheDocument();
  });
});
