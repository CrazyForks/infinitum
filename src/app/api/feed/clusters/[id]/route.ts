import { listClusterItems } from "@/lib/feed/repository";

export async function GET(_request: Request, context: RouteContext<"/api/feed/clusters/[id]">) {
  const { id } = await context.params;
  const items = await listClusterItems(id);

  return Response.json({ items });
}
