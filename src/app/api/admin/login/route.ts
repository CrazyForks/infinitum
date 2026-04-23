import { loginAsAdmin, validateAdminPassword } from "@/lib/admin/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? "";

  if (!validateAdminPassword(password)) {
    return Response.json(
      {
        error: "Invalid password",
      },
      { status: 401 },
    );
  }

  await loginAsAdmin();

  return Response.json({
    authenticated: true,
  });
}
