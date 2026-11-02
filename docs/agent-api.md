# Agent API

The agent API lets an AI agent, such as Claude Code, work with campaigns from a chat instruction: look at recent posts, create a comment-to-DM campaign, and switch campaigns on or off. It does not need a dashboard login.

It is **off by default**. Until you set `AGENT_API_KEY`, every `/api/agent` route answers `404` as if it did not exist, so an existing deployment is unaffected.

## Turn it on

1. Make a key. It must be at least 32 characters:

   ```bash
   openssl rand -hex 32
   ```

2. Set it on the **web app** (for example in your Vercel project settings), then redeploy:

   | Variable | Required | What it does |
   | --- | --- | --- |
   | `AGENT_API_KEY` | yes | The key an agent sends. Shorter than 32 characters counts as off. |
   | `AGENT_WORKSPACE_ID` | if you have more than one workspace | The workspace the agent acts on. With exactly one workspace it is picked automatically. With several and no value, the API answers `503` instead of guessing. |

3. Give the agent the key and your site address as environment variables on the machine where it runs, never in a chat message or a file in the repo:

   ```bash
   export OPENREPLY_URL="https://your-openreply-site"
   export AGENT_API_KEY="..."
   ```

To rotate the key, change `AGENT_API_KEY` and redeploy. The old key stops working at once. To turn the API off, remove the variable.

## Endpoints

Every request sends `Authorization: Bearer <key>`. Responses are `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`, and are never cached.

### `GET /api/agent/posts`

Recent Instagram posts, newest first. Query: `limit` (1 to 25, default 10), `instagramAccountId` (optional).

### `GET /api/agent/campaigns`

Up to 100 campaigns, newest first, each with its target, keywords, message, links and `dmsSent`.

### `POST /api/agent/campaigns`

Create a campaign.

| Field | Notes |
| --- | --- |
| `name` | 1 to 100 characters |
| `target` | `post`, `next_reel` or `any_post` |
| `postId` | required when `target` is `post` |
| `keywords` | 1 to 10 keywords, each up to 50 characters |
| `wholeWordMatch` | default `true` |
| `dmMessage` | 1 to 1000 characters |
| `linkUrl` | optional, must start with `https://` |
| `linkButtonLabel` | optional, up to 20 characters |
| `publicReplyMessages` | optional, up to 10 visible comment replies |
| `requireFollow` | optional, needs `followPromptMessage` and `followPromptButtonLabel` |
| `isActive` | default `false`, so a person can check the message before it goes live |

```bash
curl -sS -X POST "$OPENREPLY_URL/api/agent/campaigns" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Panduan mula",
    "target": "next_reel",
    "keywords": ["NAK BELAJAR"],
    "dmMessage": "Terima kasih. Ini panduan untuk mula.",
    "linkUrl": "https://example.com/panduan",
    "isActive": false
  }'
```

### `PATCH /api/agent/campaigns/{id}`

Switch a campaign on or off with `{"isActive": true}` or `{"isActive": false}`.

## What the agent cannot do

It cannot edit a message, delete a campaign, read conversations or see access tokens. Those stay in the dashboard. Every call is limited to one workspace.

## Safety notes

- Keep the key out of chat, logs, screenshots and commits. Anyone with it can switch campaigns on for your account.
- Campaigns send messages to real people. The `openreply-campaign` skill in `.claude/skills` asks for a yes before it switches one on.
- There is no rate limit on these routes beyond your host's own. Put one in front if the key could ever leak.
- Instagram's policies, permissions, messaging windows and rate limits still apply, as for every other campaign.
