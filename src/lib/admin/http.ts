import { AdminAuthError } from "@/lib/admin/session";

export function getAdminErrorStatus(error: unknown, fallbackStatus = 400) {
  if (error instanceof AdminAuthError) {
    return error.status;
  }

  if (error instanceof Error && error.message === "Unauthorized") {
    return 401;
  }

  return fallbackStatus;
}
