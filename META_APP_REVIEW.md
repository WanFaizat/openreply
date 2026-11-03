# Meta App Review notes

You only need App Review if you want people who are not testers on your app to connect their own Instagram accounts. If you run OpenReply for your own accounts, skip this. See the "Letting other people use your instance" section of [docs/setup.md](docs/setup.md).

OpenReply uses the official Instagram API with Unified Login to connect a professional account, receive comment and messaging webhooks, and send comment-to-DM and Story-reply keyword automations.

## Permissions to request

- `instagram_basic`
- `instagram_manage_comments`
- `instagram_manage_messages`
- `business_management`

## Permission justifications

Paste these into the App Review request, adjusted to your wording.

`instagram_basic`. After an account owner authorizes through Instagram API Unified Login and selects their business portfolio and Instagram professional account, we read the assigned account ID and username to associate it with their workspace and display the account each automation belongs to. No Facebook Page is needed.

`instagram_manage_comments`. When a follower comments a keyword the account owner configured on the owner's own post or reel, we receive the comment through the comments webhook and, if the owner enabled it, post a public reply under that comment. We only act on comments on the connecting account's own media.

`instagram_manage_messages`. After a follower comments a configured keyword, we send that follower a one-time private reply with content the account owner set up. We also receive inbound messages, including Story replies, and can respond when the message matches an enabled keyword automation. We send only the configured replies and respect Meta's messaging policies and rate limits.

`business_management`. Unified Login gives the app a Business Integration System User access token for the business portfolio the account owner selects. Meta only lets that token reach the shared Instagram account when the login configuration also asks for this permission. We use it for that one purpose: to let the system user see the Instagram account the owner chose to share. We do not read or change anything else in the owner's business portfolio.

## Screencast script

Record on your published app, real accounts, one take, about two to three minutes. Narrate each step.

1. Sign in with an email magic link.
2. Go to Settings and click Connect Instagram. Show Unified Login, selection of the business portfolio and Instagram account, and the approved Instagram permissions being granted.
3. Create a campaign on a recent post with keyword `LINK`, a DM message, and save.
4. On a second phone or account, comment `LINK` on that post.
5. Show the second account receiving the DM, and the public reply appearing under the comment.
6. Back in the app, show the DM Logs page with the SENT row.

Reviewers want to see the permission produce a real result for a real user. This flow does that directly.

## Compliance positioning

- The app never scrapes Instagram and never asks for a password.
- It only sends a reply when someone comments on the connected account's own content.
- Tokens are encrypted at rest with AES-256-GCM.
- Users can disconnect Instagram from Settings.
- Per-account rate limiting and deduplication prevent spammy behavior.

## Business verification

Meta usually requires business verification before granting Advanced Access. It asks for a document proving a legal entity: a business registration or license, articles of incorporation, a business tax document, or a business bank statement. If you do not have a registered business, you cannot complete this step, and the practical path is to run OpenReply for your own accounts instead, which never needs review.
