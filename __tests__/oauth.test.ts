import { createHmac } from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  exchangeCodeForToken,
  getAuthorizationUrl,
  sanitizeErrorMessage,
  verifyOAuthState,
} from "../lib/meta/oauth";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-with-enough-length");
  vi.stubEnv("INSTAGRAM_APP_ID", "1671833827801953");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "1390388576643422");
  vi.stubEnv("FACEBOOK_APP_SECRET", "test-meta-app-secret");
  vi.stubEnv(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
});

describe("OAuth state and token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const encrypted = encryptToken("long-lived-token");
    expect(encrypted).not.toBe("long-lived-token");
    expect(decryptToken(encrypted)).toBe("long-lived-token");
  });

  it("signs and verifies Instagram OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(state)?.workspaceId).toBe("workspace_123");
  });

  it("rejects tampered OAuth state", () => {
    const state = createOAuthState("workspace_123");
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });

  // Builds a state whose signature is valid but whose payload has an
  // unusual shape, so verifyOAuthState is exercised on its own validation
  // rather than on the signature check.
  const signedState = (payload: Record<string, unknown>) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", process.env.NEXTAUTH_SECRET!)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  };

  it("rejects a state with no timestamp", () => {
    expect(verifyOAuthState(signedState({ workspaceId: "workspace_123" }))).toBeNull();
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: "workspace_123", ts: "not-a-number" })
      )
    ).toBeNull();
  });

  it("rejects a timestamp in the future", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() + 60 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects an expired timestamp", () => {
    expect(
      verifyOAuthState(
        signedState({
          workspaceId: "workspace_123",
          ts: Date.now() - 11 * 60 * 1000,
        })
      )
    ).toBeNull();
  });

  it("rejects a state whose workspaceId is not a string", () => {
    expect(
      verifyOAuthState(
        signedState({ workspaceId: 123, ts: Date.now() })
      )
    ).toBeNull();
  });

  it("builds a Unified Login URL with its config ID and signed dynamic state", () => {
    const state = createOAuthState("workspace_123");
    const url = new URL(getAuthorizationUrl("https://example.com/callback", state));

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1671833827801953");
    expect(url.searchParams.get("config_id")).toBe("1390388576643422");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("prompt")).toBe("login");
  });

  it("exchanges the authorization code with Meta for a Unified Login token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "business-integration-token" }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeCodeForToken(
        "authorization-code",
        "https://example.com/api/instagram/callback"
      )
    ).resolves.toEqual({
      accessToken: "business-integration-token",
      expiresIn: null,
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.origin).toBe("https://graph.facebook.com");
    expect(requestUrl.pathname).toBe("/v25.0/oauth/access_token");
    expect(requestUrl.searchParams.get("client_id")).toBe("1671833827801953");
    expect(requestUrl.searchParams.get("code")).toBe("authorization-code");
    expect(requestUrl.searchParams.get("redirect_uri")).toBe(
      "https://example.com/api/instagram/callback"
    );
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });

  it("redacts raw and encrypted tokens from callback error messages", () => {
    const rawToken = "unified-access-token-value";
    const encryptedToken = "encrypted/token+value==";
    const error = new Error(
      `Invalid create({ accessToken: "${encryptedToken}" }); access_token=${rawToken}`
    );

    expect(
      sanitizeErrorMessage(error, [rawToken, encryptedToken])
    ).toBe(
      'Invalid create({ accessToken: "[REDACTED]" }); access_token=[REDACTED]'
    );
  });
});
