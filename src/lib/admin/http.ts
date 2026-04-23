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

export function getErrorMessage(error: unknown, fallbackMessage = "Invalid request") {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function adminErrorResponse(error: unknown, fallbackStatus = 400, fallbackMessage = "Invalid request") {
  return Response.json(
    {
      error: getErrorMessage(error, fallbackMessage),
    },
    { status: getAdminErrorStatus(error, fallbackStatus) },
  );
}
