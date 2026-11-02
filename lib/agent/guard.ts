import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  extractBearerToken,
  isAgentApiEnabled,
  verifyAgentKey,
} from "@/lib/agent/auth";

export type AgentAuthResult =
  | { ok: true; workspaceId: string }
  | { ok: false; response: NextResponse };

function fail(status: number, error: string, headers?: Record<string, string>) {
  return {
    ok: false as const,
    response: NextResponse.json(
      { success: false, error },
      { status, headers: { "Cache-Control": "no-store", ...headers } }
    ),
  };
}

/**
 * The workspace the agent acts on. AGENT_WORKSPACE_ID pins it. Without it, the
 * agent is only allowed when the instance has exactly one workspace, so it can
 * never guess between two.
 */
export async function resolveAgentWorkspaceId(): Promise<string | null> {
  const configured = process.env.AGENT_WORKSPACE_ID?.trim();
  if (configured) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: configured },
      select: { id: true },
    });
    return workspace?.id ?? null;
  }

  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
    take: 2,
  });
  return workspaces.length === 1 ? workspaces[0].id : null;
}

/**
 * Gate for every /api/agent route. Order matters: a deployment that has not
 * turned the agent API on answers 404, as if the routes did not exist.
 */
export async function authorizeAgent(
  request: NextRequest
): Promise<AgentAuthResult> {
  if (!isAgentApiEnabled()) return fail(404, "Not found");

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!verifyAgentKey(token)) {
    return fail(401, "Unauthorized", { "WWW-Authenticate": "Bearer" });
  }

  const workspaceId = await resolveAgentWorkspaceId();
  if (!workspaceId) {
    return fail(
      503,
      "Agent workspace is not set. Set AGENT_WORKSPACE_ID to the workspace id."
    );
  }

  return { ok: true, workspaceId };
}
