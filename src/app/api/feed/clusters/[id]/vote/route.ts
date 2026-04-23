import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { invalidateFeedCache } from "@/lib/feed/cache";

async function getVisitorIdCookie(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    let visitorId = cookieStore.get("visitorId")?.value;
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      cookieStore.set("visitorId", visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
    return visitorId;
  } catch {
    // In test environment or when cookies() is not available
    return undefined;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clusterId } = await params;
    const visitorId = await getVisitorIdCookie();

    if (!visitorId) {
      return Response.json(
        { error: "Unable to identify visitor." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { voteType: "upvote" | "downvote" };

    if (!body.voteType || !["upvote", "downvote"].includes(body.voteType)) {
      return Response.json(
        { error: "Invalid vote type. Must be 'upvote' or 'downvote'." },
        { status: 400 },
      );
    }

    // 检查聚类是否存在
    const cluster = await prisma.contentCluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      return Response.json(
        { error: "Cluster not found." },
        { status: 404 },
      );
    }

    // 使用事务处理投票
    const result = await prisma.$transaction(async (tx) => {
      // 查找现有投票
      const existingVote = await tx.visitorClusterVote.findUnique({
        where: {
          clusterId_visitorId: {
            clusterId,
            visitorId,
          },
        },
      });

      let upvotesChange = 0;
      let downvotesChange = 0;

      if (existingVote) {
        // 如果已经投过相同的票，则取消投票
        if (existingVote.voteType === body.voteType) {
          await tx.visitorClusterVote.delete({
            where: { id: existingVote.id },
          });
          if (body.voteType === "upvote") {
            upvotesChange = -1;
          } else {
            downvotesChange = -1;
          }
        } else {
          // 如果投的是相反的票，则更新投票
          await tx.visitorClusterVote.update({
            where: { id: existingVote.id },
            data: { voteType: body.voteType },
          });
          if (body.voteType === "upvote") {
            upvotesChange = 1;
            downvotesChange = -1;
          } else {
            upvotesChange = -1;
            downvotesChange = 1;
          }
        }
      } else {
        // 创建新投票
        await tx.visitorClusterVote.create({
          data: {
            clusterId,
            visitorId,
            voteType: body.voteType,
          },
        });
        if (body.voteType === "upvote") {
          upvotesChange = 1;
        } else {
          downvotesChange = 1;
        }
      }

      // 更新聚类的投票数
      const updatedCluster = await tx.contentCluster.update({
        where: { id: clusterId },
        data: {
          upvotes: { increment: upvotesChange },
          downvotes: { increment: downvotesChange },
        },
      });

      // 获取当前用户的投票状态
      const currentVote = await tx.visitorClusterVote.findUnique({
        where: {
          clusterId_visitorId: {
            clusterId,
            visitorId,
          },
        },
      });

      return {
        upvotes: updatedCluster.upvotes,
        downvotes: updatedCluster.downvotes,
        userVote: currentVote?.voteType ?? null,
      };
    });

    // 投票成功后清除 feed 缓存，确保访客能看到最新的投票数据
    invalidateFeedCache();

    return Response.json(result);
  } catch (error) {
    console.error("Vote error:", error);
    return Response.json(
      { error: "Failed to process vote." },
      { status: 500 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clusterId } = await params;
    const visitorId = await getVisitorIdCookie();

    const cluster = await prisma.contentCluster.findUnique({
      where: { id: clusterId },
      include: {
        visitorVotes: visitorId ? {
          where: { visitorId },
          select: { voteType: true },
        } : undefined,
      },
    });

    if (!cluster) {
      return Response.json(
        { error: "Cluster not found." },
        { status: 404 },
      );
    }

    return Response.json({
      upvotes: cluster.upvotes,
      downvotes: cluster.downvotes,
      userVote: cluster.visitorVotes?.[0]?.voteType ?? null,
    });
  } catch (error) {
    console.error("Get vote error:", error);
    return Response.json(
      { error: "Failed to get vote status." },
      { status: 500 },
    );
  }
}
