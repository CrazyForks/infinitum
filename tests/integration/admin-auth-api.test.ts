import { afterEach, describe, expect, it, vi } from "vitest";

const loginAsAdmin = vi.fn();
const clearAdminSession = vi.fn();
const getAdminSession = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    loginAsAdmin,
    clearAdminSession,
    getAdminSession,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
});

describe("/api/admin auth routes", () => {
  it("logs in with the configured admin password and returns the session state", async () => {
    process.env.ADMIN_PASSWORD = "super-secret";
    process.env.ADMIN_SESSION_SECRET = "test-session-secret";
    loginAsAdmin.mockResolvedValue(undefined);
    getAdminSession.mockResolvedValue({
      isAdmin: true,
      expiresAt: new Date("2026-04-17T00:00:00.000Z"),
    });

    const { POST: loginPost } = await import("@/app/api/admin/login/route");
    const loginResponse = await loginPost(
      new Request("http://localhost/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: "super-secret" }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const loginJson = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginAsAdmin).toHaveBeenCalledOnce();
    expect(loginJson.authenticated).toBe(true);

    const { GET: sessionGet } = await import("@/app/api/admin/session/route");
    const sessionResponse = await sessionGet();
    const sessionJson = await sessionResponse.json();

    expect(sessionResponse.status).toBe(200);
    expect(sessionJson.isAdmin).toBe(true);
    expect(sessionJson.expiresAt).toBe("2026-04-17T00:00:00.000Z");
  });

  it("rejects invalid admin passwords", async () => {
    process.env.ADMIN_PASSWORD = "super-secret";
    process.env.ADMIN_SESSION_SECRET = "test-session-secret";

    const { POST } = await import("@/app/api/admin/login/route");
    const response = await POST(
      new Request("http://localhost/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong-password" }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(loginAsAdmin).not.toHaveBeenCalled();
    expect(json.error).toBe("Invalid password");
  });

  it("clears the admin session on logout", async () => {
    clearAdminSession.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/admin/logout/route");
    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(clearAdminSession).toHaveBeenCalledOnce();
    expect(json.authenticated).toBe(false);
  });
});
