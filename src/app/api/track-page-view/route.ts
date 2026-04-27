import { NextResponse } from "next/server";

import { getVisitorIdCookie } from "@/lib/feed/visitor";
import { getPageViewStats, recordPageView } from "@/lib/analytics/repository";

export async function POST(request: Request) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const visitorId = await getVisitorIdCookie();

    if (!visitorId) {
      return NextResponse.json({ pv: 0, uv: 0 });
    }

    await recordPageView(path, visitorId);

    const stats = await getPageViewStats(path);

    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ pv: 0, uv: 0 });
  }
}
