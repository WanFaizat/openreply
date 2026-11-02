import { describe, expect, it } from "vitest";
import {
  createAgentCampaignSchema,
  toggleAgentCampaignSchema,
} from "../lib/agent/schemas";

const valid = {
  name: "Panduan simpan emas",
  target: "next_reel",
  keywords: ["NAK BELAJAR"],
  dmMessage: "Terima kasih. Ini panduan untuk mula.",
};

describe("createAgentCampaignSchema", () => {
  it("accepts a minimal campaign and starts it switched off", () => {
    const parsed = createAgentCampaignSchema.parse(valid);
    expect(parsed.isActive).toBe(false);
    expect(parsed.wholeWordMatch).toBe(true);
    expect(parsed.publicReplyMessages).toEqual([]);
  });

  it("requires a postId when targeting one post", () => {
    expect(
      createAgentCampaignSchema.safeParse({ ...valid, target: "post" }).success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        target: "post",
        postId: "1789",
      }).success
    ).toBe(true);
  });

  it("does not need a postId for next_reel or any_post", () => {
    for (const target of ["next_reel", "any_post"]) {
      expect(
        createAgentCampaignSchema.safeParse({ ...valid, target }).success
      ).toBe(true);
    }
  });

  it("rejects an unknown target", () => {
    expect(
      createAgentCampaignSchema.safeParse({ ...valid, target: "everything" })
        .success
    ).toBe(false);
  });

  it("needs at least one keyword and at most ten", () => {
    expect(
      createAgentCampaignSchema.safeParse({ ...valid, keywords: [] }).success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        keywords: Array.from({ length: 11 }, (_, i) => `k${i}`),
      }).success
    ).toBe(false);
  });

  it("only allows https links", () => {
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        linkUrl: "http://example.com/guide",
      }).success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        linkUrl: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        linkUrl: "https://example.com/guide",
      }).success
    ).toBe(true);
  });

  it("limits the message and button label lengths", () => {
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        dmMessage: "x".repeat(1001),
      }).success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        linkButtonLabel: "x".repeat(21),
      }).success
    ).toBe(false);
  });

  it("needs a prompt and button when a follow is required", () => {
    expect(
      createAgentCampaignSchema.safeParse({ ...valid, requireFollow: true })
        .success
    ).toBe(false);
    expect(
      createAgentCampaignSchema.safeParse({
        ...valid,
        requireFollow: true,
        followPromptMessage: "Follow dulu ya",
        followPromptButtonLabel: "Dah follow",
      }).success
    ).toBe(true);
  });
});

describe("toggleAgentCampaignSchema", () => {
  it("accepts only an isActive boolean", () => {
    expect(toggleAgentCampaignSchema.safeParse({ isActive: true }).success).toBe(
      true
    );
    expect(toggleAgentCampaignSchema.safeParse({}).success).toBe(false);
    expect(
      toggleAgentCampaignSchema.safeParse({ isActive: "yes" }).success
    ).toBe(false);
  });
});
