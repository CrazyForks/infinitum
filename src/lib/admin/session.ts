import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE_NAME = "infinitum_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type AdminSessionPayload = {
  exp: number;
};

export class AdminAuthError extends Error {
  status: number;

  constructor(message = "Unauthorized", status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!password) {
    throw new Error("Missing ADMIN_PASSWORD environment variable.");
  }

  return password;
}

function getAdminSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET environment variable.");
  }

  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getAdminSessionSecret()).update(payload).digest("base64url");
}

function encodeSessionToken(payload: AdminSessionPayload): string {
  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = Buffer.from(serializedPayload, "utf8").toString("base64url");
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function decodeSessionToken(token: string): AdminSessionPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSessionPayload;

    if (typeof parsed.exp !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  };
}

export async function loginAsAdmin() {
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  const token = encodeSessionToken({
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, buildCookieOptions(expiresAt));

  return {
    isAdmin: true,
    expiresAt,
  };
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
    ...buildCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return {
      isAdmin: false,
      expiresAt: null,
    };
  }

  const payload = decodeSessionToken(token);

  if (!payload) {
    return {
      isAdmin: false,
      expiresAt: null,
    };
  }

  const expiresAt = new Date(payload.exp * 1000);

  if (expiresAt.getTime() <= Date.now()) {
    return {
      isAdmin: false,
      expiresAt: null,
    };
  }

  return {
    isAdmin: true,
    expiresAt,
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    throw new AdminAuthError();
  }

  return session;
}

export function validateAdminPassword(password: string): boolean {
  return password === getAdminPassword();
}
