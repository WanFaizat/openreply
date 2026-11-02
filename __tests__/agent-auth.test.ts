import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_AGENT_KEY_LENGTH,
  extractBearerToken,
  isAgentApiEnabled,
  verifyAgentKey,
} from "../lib/agent/auth";

const GOOD_KEY = "k".repeat(MIN_AGENT_KEY_LENGTH + 8);

describe("agent API key", () => {
  const original = process.env.AGENT_API_KEY;

  beforeEach(() => {
    delete process.env.AGENT_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_API_KEY;
    else process.env.AGENT_API_KEY = original;
  });

  it("is off when no key is set", () => {
    expect(isAgentApiEnabled()).toBe(false);
    expect(verifyAgentKey(GOOD_KEY)).toBe(false);
  });

  it("treats a key shorter than the minimum as not enabled", () => {
    process.env.AGENT_API_KEY = "short-key";
    expect(isAgentApiEnabled()).toBe(false);
    expect(verifyAgentKey("short-key")).toBe(false);
  });

  it("accepts only the exact key", () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    expect(isAgentApiEnabled()).toBe(true);
    expect(verifyAgentKey(GOOD_KEY)).toBe(true);
    expect(verifyAgentKey(GOOD_KEY + "x")).toBe(false);
    expect(verifyAgentKey(GOOD_KEY.slice(0, -1))).toBe(false);
    expect(verifyAgentKey("")).toBe(false);
    expect(verifyAgentKey(null)).toBe(false);
    expect(verifyAgentKey(undefined)).toBe(false);
  });

  it("ignores whitespace around the configured key", () => {
    process.env.AGENT_API_KEY = `  ${GOOD_KEY}\n`;
    expect(verifyAgentKey(GOOD_KEY)).toBe(true);
  });
});

describe("extractBearerToken", () => {
  it("reads a Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("rejects anything that is not a single Bearer token", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc123")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer a b")).toBeNull();
  });
});

describe("authorizeAgent", () => {
  const findUnique = vi.fn();
  const findMany = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/db/client", () => ({
      prisma: { workspace: { findUnique, findMany } },
    }));
    findUnique.mockReset();
    findMany.mockReset();
    delete process.env.AGENT_API_KEY;
    delete process.env.AGENT_WORKSPACE_ID;
  });

  afterEach(() => {
    delete process.env.AGENT_API_KEY;
    delete process.env.AGENT_WORKSPACE_ID;
    vi.doUnmock("@/lib/db/client");
  });

  async function run(authorization?: string) {
    const { NextRequest } = await import("next/server");
    const { authorizeAgent } = await import("../lib/agent/guard");
    const headers: Record<string, string> = {};
    if (authorization) headers.authorization = authorization;
    return authorizeAgent(
      new NextRequest("http://localhost/api/agent/campaigns", { headers })
    );
  }

  it("answers 404 when the agent API is not enabled", async () => {
    const result = await run(`Bearer ${GOOD_KEY}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("answers 401 for a missing or wrong key", async () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    for (const header of [undefined, "Bearer wrong-key-value", "Basic x"]) {
      const result = await run(header);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
    }
    // Wrong credentials must not reach the database.
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("uses the pinned workspace when AGENT_WORKSPACE_ID is set", async () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    process.env.AGENT_WORKSPACE_ID = "ws_pinned";
    findUnique.mockResolvedValue({ id: "ws_pinned" });

    const result = await run(`Bearer ${GOOD_KEY}`);
    expect(result).toEqual({ ok: true, workspaceId: "ws_pinned" });
  });

  it("refuses a pinned workspace that does not exist", async () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    process.env.AGENT_WORKSPACE_ID = "ws_gone";
    findUnique.mockResolvedValue(null);

    const result = await run(`Bearer ${GOOD_KEY}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("falls back to the only workspace when there is exactly one", async () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    findMany.mockResolvedValue([{ id: "ws_only" }]);

    const result = await run(`Bearer ${GOOD_KEY}`);
    expect(result).toEqual({ ok: true, workspaceId: "ws_only" });
  });

  it("refuses to guess between several workspaces", async () => {
    process.env.AGENT_API_KEY = GOOD_KEY;
    findMany.mockResolvedValue([{ id: "ws_a" }, { id: "ws_b" }]);

    const result = await run(`Bearer ${GOOD_KEY}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
