import { NextRequest, NextResponse } from "next/server";
import { authorizeAgent } from "@/lib/agent/guard";
import { toggleAgentCampaignSchema } from "@/lib/agent/schemas";
import { setAgentCampaignActive } from "@/lib/agent/campaigns";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// The agent can switch a campaign on or off. It cannot edit messages or delete
// campaigns; those stay in the dashboard.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const parsed = toggleAgentCampaignSchema.safeParse(body);
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

  const { id } = await params;
  const campaign = await setAgentCampaignActive(
    auth.workspaceId,
    id,
    parsed.data.isActive
  );
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { success: true, data: campaign },
    { headers: NO_STORE }
  );
}
