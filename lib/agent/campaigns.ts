import { prisma } from "@/lib/db/client";
import { buildInitialCampaignLinks } from "@/lib/campaigns/links";
import { buildReportUrl, generateReportShareSlug } from "@/lib/reports/share";
import { buildTrackedUrl } from "@/lib/tracking/message";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import type { CreateAgentCampaignInput } from "@/lib/agent/schemas";

type CampaignTarget = "post" | "next_reel" | "any_post";

type CampaignRecord = {
  id: string;
  name: string;
  isActive: boolean;
  keywords: string[];
  matchAnyPost: boolean;
  pendingNextReel: boolean;
  postId: string | null;
  postUrl: string | null;
  dmMessage: string;
  publicReplyEnabled: boolean;
  reportShareSlug: string | null;
  createdAt: Date;
  trackedLinks: { slug: string; destinationUrl: string }[];
};

function targetOf(campaign: CampaignRecord): CampaignTarget {
  if (campaign.pendingNextReel) return "next_reel";
  if (campaign.matchAnyPost) return "any_post";
  return "post";
}

/** What an agent is allowed to see about a campaign. */
export function toAgentCampaign(campaign: CampaignRecord) {
  return {
    id: campaign.id,
    name: campaign.name,
    isActive: campaign.isActive,
    target: targetOf(campaign),
    postId: campaign.postId,
    postUrl: campaign.postUrl,
    keywords: campaign.keywords,
    dmMessage: campaign.dmMessage,
    publicReplyEnabled: campaign.publicReplyEnabled,
    links: campaign.trackedLinks.map((link) => ({
      destinationUrl: link.destinationUrl,
      trackedUrl: buildTrackedUrl(link.slug),
    })),
    reportUrl: campaign.reportShareSlug
      ? buildReportUrl(campaign.reportShareSlug)
      : null,
    createdAt: campaign.createdAt,
  };
}

const campaignInclude = {
  trackedLinks: {
    select: { slug: true, destinationUrl: true },
    orderBy: TRACKED_LINK_ORDER,
  },
} as const;

export async function listAgentCampaigns(workspaceId: string) {
  const campaigns = await prisma.automation.findMany({
    where: { workspaceId },
    include: campaignInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const sent = await prisma.dmLog.groupBy({
    by: ["automationId"],
    where: { workspaceId, status: "SENT" },
    _count: { _all: true },
  });
  const sentById = new Map(sent.map((row) => [row.automationId, row._count._all]));

  return campaigns.map((campaign) => ({
    ...toAgentCampaign(campaign),
    dmsSent: sentById.get(campaign.id) ?? 0,
  }));
}

export type CreateAgentCampaignResult =
  | { ok: true; data: ReturnType<typeof toAgentCampaign> }
  | { ok: false; status: number; error: string };

export async function createAgentCampaign(
  workspaceId: string,
  input: CreateAgentCampaignInput
): Promise<CreateAgentCampaignResult> {
  const instagramAccount = input.instagramAccountId
    ? await prisma.instagramAccount.findFirst({
        where: { id: input.instagramAccountId, workspaceId },
      })
    : await prisma.instagramAccount.findFirst({
        where: { workspaceId },
        orderBy: { connectedAt: "desc" },
      });

  if (!instagramAccount) {
    return {
      ok: false,
      status: 400,
      error: "Connect Instagram before creating campaigns",
    };
  }

  const pendingNextReel = input.target === "next_reel";
  const matchAnyPost = input.target === "any_post";
  const isSpecificPost = input.target === "post";
  const publicReplyMessages = input.publicReplyMessages
    .map((message) => message.trim())
    .filter(Boolean);
  const publicReplyEnabled = publicReplyMessages.length > 0;

  const linkCreates = buildInitialCampaignLinks({
    workspaceId,
    primaryUrl: input.linkUrl,
  });

  const campaign = await prisma.automation.create({
    data: {
      name: input.name,
      postId: isSpecificPost ? (input.postId ?? null) : null,
      postUrl: isSpecificPost ? (input.postUrl ?? null) : null,
      pendingNextReel,
      matchAnyPost,
      keywords: input.keywords,
      matchAnyWord: false,
      dmTriggerEnabled: false,
      dmMessage: input.dmMessage,
      openingDmEnabled: false,
      linkButtonLabel: input.linkButtonLabel || null,
      requireFollow: input.requireFollow,
      followPromptMessage: input.requireFollow
        ? (input.followPromptMessage ?? null)
        : null,
      followPromptButtonLabel: input.requireFollow
        ? (input.followPromptButtonLabel ?? null)
        : null,
      followUpEnabled: false,
      followUpDelayMinutes: 0,
      publicReplyEnabled,
      publicReplyMessages,
      publicReplyMessage: publicReplyMessages[0] ?? null,
      isActive: input.isActive,
      wholeWordMatch: input.wholeWordMatch,
      workspaceId,
      instagramAccountId: instagramAccount.id,
      reportShareSlug: generateReportShareSlug(),
      ...(linkCreates.length > 0
        ? { trackedLinks: { create: linkCreates } }
        : {}),
    },
    include: campaignInclude,
  });

  return { ok: true, data: toAgentCampaign(campaign) };
}

export async function setAgentCampaignActive(
  workspaceId: string,
  campaignId: string,
  isActive: boolean
) {
  // Scoped by workspace, so one workspace's key can never touch another's.
  const existing = await prisma.automation.findFirst({
    where: { id: campaignId, workspaceId },
    select: { id: true },
  });
  if (!existing) return null;

  const campaign = await prisma.automation.update({
    where: { id: campaignId },
    data: { isActive },
    include: campaignInclude,
  });
  return toAgentCampaign(campaign);
}
