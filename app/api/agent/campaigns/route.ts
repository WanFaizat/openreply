import { NextRequest, NextResponse } from "next/server";
import { authorizeAgent } from "@/lib/agent/guard";
import { createAgentCampaignSchema } from "@/lib/agent/schemas";
import { createAgentCampaign, listAgentCampaigns } from "@/lib/agent/campaigns";

// Never cache: an agent must see the campaign it just created.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const auth = await authorizeAgent(request);
  if (!auth.ok) return auth.response;

  const data = await listAgentCampaigns(auth.workspaceId);
  return NextResponse.json({ success: true, data }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAgent(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body must be valid JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

  const parsed = createAgentCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid input",
        details: parsed.error.flatten(),
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const result = await createAgentCampaign(auth.workspaceId, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { success: true, data: result.data },
    { status: 201, headers: NO_STORE }
  );
}
