import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import {
  discoverUnifiedInstagramAccounts,
  subscribeInstagramAccountToWebhooks,
} from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
  getMetaLoginConfigId,
  sanitizeErrorMessage,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=forbidden`);
  }

  let accessTokenForError: string | undefined;
  let encryptedTokenForError: string | undefined;
  try {
    const redirectUri = `${baseUrl}/api/instagram/callback`;
    const { accessToken, expiresIn } = await exchangeCodeForToken(
      code,
      redirectUri
    );
    accessTokenForError = accessToken;
    const tokenExpiresAt =
      expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000);
    const knownAccounts = await prisma.instagramAccount.findMany({
      where: { workspaceId: state.workspaceId },
      select: { instagramId: true },
    });
    const {
      clientBusinessId,
      accounts,
    } = await discoverUnifiedInstagramAccounts(
      accessToken,
      knownAccounts.map((account) => account.instagramId)
    );
    if (accounts.length !== 1) {
      throw new Error(
        `Unified Login returned ${accounts.length} Instagram accounts. Configure the login to share exactly one account per OpenReply connection.`
      );
    }
    const userInfo = accounts[0];
    const instagramId = userInfo.id;
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });

    if (!connection.allowed) {
      return NextResponse.redirect(
        `${baseUrl}/settings?instagram=already_connected`
      );
    }

    const encryptedToken = encryptToken(accessToken);
    encryptedTokenForError = encryptedToken;

    const subscription = await subscribeInstagramAccountToWebhooks(
      instagramId,
      accessToken,
      "UNIFIED"
    );
    if (!subscription.success) {
      throw new Error(
        "Meta did not confirm the Instagram webhook subscription. The account was not connected."
      );
    }

    const data = {
      username: userInfo.username,
      name: userInfo.name,
      accessToken: encryptedToken,
      clientBusinessId,
      metaLoginConfigId: getMetaLoginConfigId(),
      tokenExpiresAt,
      webhookSubscribed: true,
      provider: "UNIFIED" as const,
    };
    const existing = await prisma.instagramAccount.findUnique({
      where: { instagramId },
    });
    if (existing) {
      const updated = await prisma.instagramAccount.updateMany({
        where: {
          id: existing.id,
          workspaceId: state.workspaceId,
          provider: { in: ["META", "INSTAGRAM", "UNIFIED"] },
        },
        data,
      });
      if (!updated.count)
        return NextResponse.redirect(
          `${baseUrl}/settings?instagram=already_connected`
        );
    } else {
      await prisma.instagramAccount.create({
        data: { ...data, workspaceId: state.workspaceId, instagramId },
      });
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    const message = sanitizeErrorMessage(err, [
      accessTokenForError,
      encryptedTokenForError,
    ]);
    console.error("[Instagram Callback] Error:", message);
    // The message is the only diagnostic a self-hoster gets for a failed
    // connect, so persist it alongside the other operational events rather
    // than leaving it in server logs they may not be able to reach.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?instagram=failed&reason=${encodeURIComponent(
        message.slice(0, 200)
      )}`
    );
  }
}
