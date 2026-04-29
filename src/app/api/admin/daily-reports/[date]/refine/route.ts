import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { streamDailyReportRefinement } from "@/lib/daily-report/service";

const refineSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  instruction: z.string().trim().min(1).max(2000),
  mode: z.enum(["chat", "generate"]).optional().default("chat"),
});

type RouteContext = {
  params: Promise<{ date: string }>;
};

function encodeSseEvent(event: { event: string } & Record<string, unknown>) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const body = refineSchema.parse(await request.json());
    const encoder = new TextEncoder();
    const iterator = streamDailyReportRefinement({
      date,
      sessionId: body.sessionId,
      instruction: body.instruction,
      mode: body.mode,
    });
    const first = await iterator.next();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) {
            controller.enqueue(encoder.encode(encodeSseEvent(first.value)));
          }

          for await (const event of iterator) {
            controller.enqueue(encoder.encode(encodeSseEvent(event)));
          }
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(encodeSseEvent({
            event: "error",
            code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "provider_error",
            message: error instanceof Error ? error.message : "AI 微调失败。",
          })));
          controller.enqueue(encoder.encode(encodeSseEvent({ event: "done", ok: false })));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
