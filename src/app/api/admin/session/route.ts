import { getAdminSession } from "@/lib/admin/session";

export async function GET() {
  const session = await getAdminSession();

  return Response.json({
    isAdmin: session.isAdmin,
    expiresAt: session.expiresAt?.toISOString() ?? null,
  });
}
