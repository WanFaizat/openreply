import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Agent API access.
 *
 * The agent API lets an automation (an AI agent such as Claude Code) list
 * posts and create or switch campaigns without a dashboard login. It is off
 * unless AGENT_API_KEY is set, so an existing deployment is unaffected.
 *
 * The key is never stored or logged here. It is compared as SHA-256 digests in
 * constant time, so neither its length nor its content leaks through timing.
 */

// 32 characters is the floor for a key worth trusting (for example the output
// of `openssl rand -hex 32` is 64). A shorter value counts as "not enabled"
// rather than quietly accepting a weak key.
export const MIN_AGENT_KEY_LENGTH = 32;

export function getConfiguredAgentKey(): string | null {
  const value = process.env.AGENT_API_KEY?.trim();
  if (!value || value.length < MIN_AGENT_KEY_LENGTH) return null;
  return value;
}

export function isAgentApiEnabled(): boolean {
  return getConfiguredAgentKey() !== null;
}

/** Pull the token out of an `Authorization: Bearer <token>` header. */
export function extractBearerToken(header: string | null | undefined) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * True only when the agent API is enabled and the provided token equals the
 * configured key.
 */
export function verifyAgentKey(provided: string | null | undefined): boolean {
  const configured = getConfiguredAgentKey();
  if (!configured || !provided) return false;
  return timingSafeEqual(digest(provided), digest(configured));
}
