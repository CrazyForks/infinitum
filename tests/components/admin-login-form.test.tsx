import { render, screen, waitFor, within } from "@testing-library/react";
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

import { AdminLoginForm, loginSuccessRedirect } from "@/components/admin/admin-login-form";

afterEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminLoginForm", () => {
  it("renders the shared shell before login", () => {
    render(<AdminLoginForm />);
    const passwordField = screen.getByLabelText("管理员密码");
    const form = passwordField.closest("form");

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "管理员登录" })).toBeInTheDocument();
    expect(form).not.toBeNull();
    expect(within(form as HTMLFormElement).getByRole("button", { name: "登录" })).toBeInTheDocument();
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
    const form = screen.getByLabelText("管理员密码").closest("form");

    await user.type(screen.getByLabelText("管理员密码"), "wrong-password");
    await user.click(within(form as HTMLFormElement).getByRole("button", { name: "登录" }));

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
    const redirectMock = vi.spyOn(loginSuccessRedirect, "assign").mockImplementation(() => {});
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

    await waitFor(() => {
      expect(redirectMock).toHaveBeenCalledWith("/admin/settings");
    });
  });

  it("shows a stable fallback message when the login request throws unexpectedly", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminLoginForm />);
    const form = screen.getByLabelText("管理员密码").closest("form");

    await user.type(screen.getByLabelText("管理员密码"), "wrong-password");
    await user.click(within(form as HTMLFormElement).getByRole("button", { name: "登录" }));

    expect(await screen.findByText("登录失败")).toBeInTheDocument();
  });
});
