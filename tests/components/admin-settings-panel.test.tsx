import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminSettingsPanel", () => {
  it("saves the basic app config section", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminSettingsPanel
        initialSettings={{
          appConfig: {
            ingestionItemConcurrency: 3,
            modelApi: {
              baseURL: "https://example.com/v1",
              model: "gpt-4.1-mini",
              apiKeyMasked: "••••••••1234",
              hasApiKey: true,
            },
          },
          blacklistKeywords: ["layoffs"],
          groups: [{ id: "group-1", name: "Core" }],
          sources: [],
        }}
      />,
    );

    await user.clear(screen.getByLabelText("并发数"));
    await user.type(screen.getByLabelText("并发数"), "4");
    await user.click(screen.getByRole("button", { name: "保存基础配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/app-config", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ingestionItemConcurrency: 4,
          modelApiBaseUrl: "https://example.com/v1",
          modelApiModel: "gpt-4.1-mini",
          modelApiKey: "",
          apiKeyMode: "keep",
        }),
      });
    });
  });
});
