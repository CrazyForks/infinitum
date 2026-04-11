import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminLoginForm } from "@/components/admin/admin-login-form";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminLoginForm", () => {
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
});
