---
name: openreply-campaign
description: Create or switch OpenReply comment-to-DM campaigns on Instagram from a chat instruction (for example "buat kempen NAK BELAJAR untuk post terbaru"). Use when the user asks to make, list, start or stop an Instagram auto-reply campaign.
---

# OpenReply campaign

Turn a chat instruction into a comment-to-DM campaign through the OpenReply agent API. Read `docs/agent-api.md` for the endpoint details.

## Before you start

- The base URL is in the `OPENREPLY_URL` environment variable and the key is in `AGENT_API_KEY`. Send the key only as `Authorization: Bearer $AGENT_API_KEY`.
- Never print, echo, log or paste the key, and never write it into a file or a commit. If either variable is missing, say which one and stop.
- A `404` answer means the agent API is not turned on for that deployment. A `401` means the key is wrong. A `503` means `AGENT_WORKSPACE_ID` is not set.
- You can list posts, list campaigns, create a campaign and switch one on or off. You cannot edit a message or delete a campaign. Tell the user to use the dashboard for those.

## Steps

1. **Find the target.** Call `GET /api/agent/posts` when the user names a post ("post terbaru", "reel semalam"). Show the post's caption start and date, and confirm it if more than one could fit. For "reel seterusnya" use target `next_reel`. For every post use `any_post`.
2. **Collect the details.** Keyword (default `NAK BELAJAR` if the user says nothing), the message to send, and the link. Ask only for what is missing, in one short question. When the user wants everyone who comments or messages to get a reply ("balas semua orang"), set `matchAnyWord: true` and no keywords. When they also want direct messages and Story replies answered, set `dmTriggerEnabled: true`. A DM campaign that answers everyone replies to each person once every 24 hours.
3. **Write the DM.** Keep it short and natural, in the user's own voice. Use "saya" for the user and "anda" for the reader. Do not use em dashes. Avoid stock phrases that sound like a bot. If the user gave the exact text, use it as it is.
4. **Keep the wording safe for Instagram and Meta policies.** No promise of profit or returns, no investment claim, no pressure. Saying that saving can start from a small amount with no monthly commitment is fine when the user says so.
5. **Show a preview and wait for a yes.** Show the target post, keywords, message, link and whether it will go live. A campaign sends messages to real people, so do not switch one on before the user agrees.
6. **Create it.** `POST /api/agent/campaigns` with `isActive: true` after the yes. Without `isActive` the campaign is created switched off.
7. **Report back in two lines.** The campaign name, its keyword and target, and whether it is on. Include the report link if the response has one.

## Switching a campaign on or off

Call `GET /api/agent/campaigns` to find the id, then `PATCH /api/agent/campaigns/{id}` with `{"isActive": true}` or `false`. Confirm the name with the user first when two campaigns look alike.

## Checks after creating

If the response was not 201, show the `error` and `details` fields in plain words and fix the input once. Do not retry the same bad request.

Remind the user, once, that campaigns only send when the OpenReply worker is running and the instance is reachable over HTTPS.
