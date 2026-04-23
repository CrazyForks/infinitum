import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { importSourcesFromOpml } from "@/lib/settings/service";

const importSchema = z.object({
  opmlText: z.string().min(1),
});

async function getOpmlText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const upload = formData.get("file");

    if (upload instanceof File) {
      return upload.text();
    }

    const text = formData.get("opmlText");
    if (typeof text === "string") {
      return text;
    }
  }

  const body = importSchema.parse(await request.json());
  return body.opmlText;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const opmlText = await getOpmlText(request);
    const summary = await importSourcesFromOpml(opmlText);

    return Response.json({ summary });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
