import { cookies } from "next/headers";

export async function getVisitorIdCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    let visitorId = cookieStore.get("visitorId")?.value;

    if (!visitorId) {
      visitorId = crypto.randomUUID();
      cookieStore.set("visitorId", visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return visitorId;
  } catch {
    return undefined;
  }
}
