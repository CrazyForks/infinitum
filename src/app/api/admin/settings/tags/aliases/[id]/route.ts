import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { deleteTagAlias } from "@/lib/tags/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteTagAlias(id);

    return Response.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
