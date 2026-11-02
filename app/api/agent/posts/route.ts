import { NextRequest, NextResponse } from "next/server";
import { authorizeAgent } from "@/lib/agent/guard";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext, getUserMedia } from "@/lib/instagram/provider";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Recent posts, newest first, so an agent can pick "the latest post".
export async function GET(request: NextRequest) {
  const auth = await authorizeAgent(request);
  if (!auth.ok) return auth.response;

  const account = await getWorkspaceInstagramAccount(
    auth.workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected" },
      { status: 400, headers: NO_STORE }
    );
  }

  const limitParam = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "10",
    10
  );
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 25)
    : 10;

  try {
    const context = await createInstagramContext(account);
    const posts = await getUserMedia({ context, limit });

    return NextResponse.json(
      {
        success: true,
        data: [...posts]
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .map((post) => ({
            id: post.id,
            caption: post.caption?.slice(0, 200) ?? null,
            type: post.media_product_type ?? post.media_type,
            postedAt: post.timestamp,
            permalink: post.permalink ?? null,
          })),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    // Log the failure, never the token or the provider response body.
    console.error(
      "[Agent API] Failed to fetch posts:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { success: false, error: "Failed to fetch Instagram posts" },
      { status: 500, headers: NO_STORE }
    );
  }
}
