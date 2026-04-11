import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { createSourceGroup } from "@/lib/settings/service";

const createGroupSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = createGroupSchema.parse(await request.json());
    const group = await createSourceGroup(body.name);

    return Response.json({ group }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
