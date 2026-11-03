/**
 * Check what the connected Instagram account's token is allowed to do.
 *
 *   npx tsx --env-file=.env scripts/check-instagram.ts
 *
 * Prints the permissions Meta says the token has, then tries the Graph API
 * calls OpenReply depends on (profile, media list, comments) and reports which
 * ones Meta accepts. It never prints the token, the app secret or any comment
 * text, so the output is safe to paste into a bug report.
 */
import { prisma } from "@/lib/db/client";
import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";
import { decryptToken, sanitizeErrorMessage } from "@/lib/meta/oauth";

type GraphError = { message?: string; code?: number; error_subcode?: number };
type GraphResult = { status: number; body: Record<string, unknown> };
type DebugTokenData = {
  type?: string;
  is_valid?: boolean;
  expires_at?: number;
  issued_at?: number;
  user_id?: string;
  profile_id?: string;
  scopes?: string[];
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
};

async function graph(url: string): Promise<GraphResult> {
  const response = await fetch(url, { cache: "no-store" });
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Not JSON. Leave the body empty and report the HTTP status instead.
  }
  return { status: response.status, body };
}

function failure(result: GraphResult): string {
  const error = result.body.error as GraphError | undefined;
  if (!error) return `HTTP ${result.status}`;
  const sub = error.error_subcode ? `/${error.error_subcode}` : "";
  return `code ${error.code}${sub}: ${error.message}`;
}

function report(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}: ${detail}`);
}

async function main() {
  const version = getMetaGraphApiVersion();
  const fb = `https://graph.facebook.com/${version}`;
  const ig = `https://graph.instagram.com/${version}`;
  const appId = requireEnv("INSTAGRAM_APP_ID");
  const appSecret = requireEnv("FACEBOOK_APP_SECRET");

  const accounts = await prisma.instagramAccount.findMany({
    select: {
      instagramId: true,
      username: true,
      provider: true,
      accessToken: true,
      tokenExpiresAt: true,
      webhookSubscribed: true,
    },
  });
  if (accounts.length === 0) {
    console.log("No Instagram account is connected.");
    return;
  }

  for (const account of accounts) {
    console.log(
      `\n@${account.username} (${account.provider}, id ${account.instagramId})`
    );
    console.log(
      `  expiry stored in database: ${account.tokenExpiresAt?.toISOString() ?? "none"}`
    );
    console.log(`  webhook subscribed flag: ${account.webhookSubscribed}`);

    const checkedTargets = new Set<string>();
    let token: string;
    try {
      token = decryptToken(account.accessToken);
    } catch {
      console.log("  The stored token cannot be decrypted. Was ENCRYPTION_KEY changed?");
      continue;
    }
    const query = (params: Record<string, string>) =>
      new URLSearchParams({ ...params, access_token: token }).toString();
    const safe = (error: unknown) =>
      sanitizeErrorMessage(error, [token, appSecret]);

    try {
      const debug = await graph(
        `${fb}/debug_token?${new URLSearchParams({
          input_token: token,
          access_token: `${appId}|${appSecret}`,
        })}`
      );
      const data = debug.body.data as DebugTokenData | undefined;
      if (!data) {
        report("token info", false, failure(debug));
      } else {
        const expiry =
          data.expires_at === 0 || data.expires_at === undefined
            ? "never"
            : new Date(data.expires_at * 1000).toISOString();
        console.log(
          `  token type: ${data.type ?? "unknown"}, valid: ${data.is_valid}, expires: ${expiry}`
        );
        console.log(
          `  issued: ${data.issued_at ? new Date(data.issued_at * 1000).toISOString() : "unknown"}, system user: ${data.user_id ?? data.profile_id ?? "unknown"}`
        );
        console.log(`  scopes: ${(data.scopes ?? []).join(", ") || "(none)"}`);
        for (const scope of data.granular_scopes ?? []) {
          console.log(
            `  granular ${scope.scope}: ${scope.target_ids?.join(", ") ?? "all targets"}`
          );
          for (const target of scope.target_ids ?? []) {
            if (checkedTargets.has(target)) continue;
            checkedTargets.add(target);
            const result = await graph(
              `${fb}/${target}?${query({ fields: "id,username" })}`
            );
            report(
              `node ${target}`,
              typeof result.body.id === "string",
              typeof result.body.id === "string" ? "reachable" : failure(result)
            );
          }
        }
      }
    } catch (error) {
      report("token info", false, safe(error));
    }

    // Which business the token belongs to. Meta ties a Unified Login token to
    // the business that was picked in the login flow, so a token for the wrong
    // business cannot see the account even though the app lists it as shared.
    try {
      const me = await graph(
        `${fb}/me?${query({ fields: "id,name,client_business_id" })}`
      );
      if (typeof me.body.id === "string") {
        report(
          "identity (/me)",
          true,
          `id ${me.body.id}, name ${String(me.body.name ?? "unknown")}, business ${String(me.body.client_business_id ?? "none")}`
        );
      } else {
        report("identity (/me)", false, failure(me));
      }
    } catch (error) {
      report("identity (/me)", false, safe(error));
    }

    const mediaFields = { fields: "id,media_product_type,timestamp", limit: "3" };
    let firstMediaId: string | undefined;

    const checks: Array<{ label: string; url: string }> = [
      {
        label: "assigned pages",
        url: `${fb}/me/assigned_pages?${query({ fields: "id,name", limit: "100" })}`,
      },
      {
        label: "profile (graph.facebook.com)",
        url: `${fb}/${account.instagramId}?${query({ fields: "id,username,media_count" })}`,
      },
      ...["v24.0", "v25.0", "v26.0"].map((other) => ({
        label: `assigned accounts (${other})`,
        url: `https://graph.facebook.com/${other}/me/assigned_instagram_accounts?${query({ fields: "id,username", limit: "100" })}`,
      })),
      {
        label: "media list (graph.facebook.com)",
        url: `${fb}/${account.instagramId}/media?${query(mediaFields)}`,
      },
      {
        label: "media list (graph.instagram.com)",
        url: `${ig}/${account.instagramId}/media?${query(mediaFields)}`,
      },
    ];

    for (const check of checks) {
      try {
        const result = await graph(check.url);
        const list = result.body.data;
        if (Array.isArray(list)) {
          let detail = `${list.length} item(s)`;
          if (check.label.startsWith("assigned accounts")) {
            const ids = list.map((item) => (item as { id?: string }).id);
            detail += ids.includes(account.instagramId)
              ? ", stored id is among them"
              : ", stored id is NOT among them";
          }
          if (check.label.startsWith("media list") && !firstMediaId) {
            firstMediaId = (list[0] as { id?: string } | undefined)?.id;
          }
          report(check.label, true, detail);
        } else if (typeof result.body.id === "string") {
          report(check.label, true, "reachable");
        } else {
          report(check.label, false, failure(result));
        }
      } catch (error) {
        report(check.label, false, safe(error));
      }
    }

    if (firstMediaId) {
      try {
        const result = await graph(
          `${fb}/${firstMediaId}/comments?${query({ fields: "id,username,timestamp", limit: "5" })}`
        );
        const list = result.body.data;
        report(
          "comments of the latest post",
          Array.isArray(list),
          Array.isArray(list) ? `${list.length} comment(s) returned` : failure(result)
        );
      } catch (error) {
        report("comments of the latest post", false, safe(error));
      }
    } else {
      console.log("  (comments not tested because no media list call worked)");
    }
  }
}

main()
  .catch((error) => {
    console.error(sanitizeErrorMessage(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
