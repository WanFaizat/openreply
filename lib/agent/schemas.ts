import { z } from "zod";

/**
 * Input for creating a campaign through the agent API.
 *
 * It is deliberately smaller than the dashboard's schema: only what a
 * comment-to-DM campaign needs. Links must be https. A new campaign is created
 * switched off unless the caller says otherwise, so a person can look at the
 * message before real people start receiving it.
 */
export const agentCampaignTargetSchema = z.enum([
  "post", // one specific post (postId required)
  "next_reel", // the next reel that gets posted
  "any_post", // every post on the account
]);

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Link must start with https://",
  });

export const createAgentCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    target: agentCampaignTargetSchema,
    postId: z.string().min(1).optional(),
    postUrl: z.string().url().optional(),
    // Not needed when matchAnyWord is true (see the refine below).
    keywords: z
      .array(z.string().trim().min(1).max(50))
      .max(10)
      .optional()
      .default([]),
    // Answer every comment or message instead of waiting for a keyword.
    matchAnyWord: z.boolean().optional().default(false),
    // Also answer direct messages and Story replies, not only comments.
    dmTriggerEnabled: z.boolean().optional().default(false),
    wholeWordMatch: z.boolean().optional().default(true),
    dmMessage: z.string().trim().min(1).max(1000),
    linkUrl: httpsUrl.optional(),
    linkButtonLabel: z.string().trim().max(20).optional(),
    publicReplyMessages: z
      .array(z.string().trim().min(1).max(1000))
      .max(10)
      .optional()
      .default([]),
    requireFollow: z.boolean().optional().default(false),
    followPromptMessage: z.string().trim().max(1000).optional(),
    followPromptButtonLabel: z.string().trim().max(20).optional(),
    instagramAccountId: z.string().min(1).optional(),
    isActive: z.boolean().optional().default(false),
  })
  .refine((data) => data.matchAnyWord || data.keywords.length >= 1, {
    message: "Give at least one keyword, or set matchAnyWord to true",
    path: ["keywords"],
  })
  .refine((data) => data.target !== "post" || Boolean(data.postId), {
    message: "postId is required when target is 'post'",
    path: ["postId"],
  })
  .refine(
    (data) =>
      !data.requireFollow ||
      (Boolean(data.followPromptMessage) &&
        Boolean(data.followPromptButtonLabel)),
    {
      message: "requireFollow needs followPromptMessage and followPromptButtonLabel",
      path: ["followPromptMessage"],
    }
  );

export type CreateAgentCampaignInput = z.infer<typeof createAgentCampaignSchema>;

/** The only change the agent API allows on an existing campaign. */
export const toggleAgentCampaignSchema = z.object({
  isActive: z.boolean(),
});
