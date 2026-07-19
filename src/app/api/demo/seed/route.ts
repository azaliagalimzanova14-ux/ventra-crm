/**
 * POST /api/demo/seed — seed the workspace with realistic demo data.
 *
 * Idempotent: checks for a `demo_seeded` onboarding flag before inserting.
 * Requires workspace.manage permission (owner/admin only).
 *
 * Seeds:
 *  - 5 clients (mix of lead / active / vip)
 *  - 3 conversations with messages
 *  - 4 deals across different stages
 *  - 3 tasks
 */

import { randomUUID }                     from "node:crypto";
import { NextRequest, NextResponse }      from "next/server";
import { requireAuth, AuthError, assertPermission } from "@/lib/server/auth-helpers";
import { createClient }                   from "@/lib/server/db-clients";
import { createConversation }             from "@/lib/server/db-conversations";
import { createMessage }                  from "@/lib/server/db-messages";
import { createDeal, listDealStages }     from "@/lib/server/db-deals";
import { createTask }                     from "@/lib/server/db-tasks";
import { completeOnboardingStep, getOnboardingProgress } from "@/lib/server/db-onboarding";
import { trackEvent }                     from "@/lib/server/db-analytics";
import { getDb }                          from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    assertPermission(auth, "workspace.manage");
    const { workspaceId, userId } = auth;

    // Check if already seeded
    const progress = getOnboardingProgress(workspaceId);
    const alreadySeeded = progress.some((p) => p.step === "import_clients" && p.completed === 1);
    if (alreadySeeded) {
      const body = await req.json().catch(() => ({})) as { force?: boolean };
      if (!body.force) {
        return NextResponse.json({ ok: true, skipped: true, reason: "already_seeded" });
      }
    }

    // Ensure stages exist
    const stages = listDealStages(workspaceId);
    const stageMap: Record<string, string> = {};
    for (const s of stages) stageMap[s.name] = s.id;

    // ── Clients ────────────────────────────────────────────────────────────────

    const sarah = createClient({
      workspace_id: workspaceId,
      name:    "Sarah Mitchell",
      company: "Apex Digital",
      email:   "sarah@apexdigital.io",
      phone:   "+1 555 0201",
      status:  "active",
      source:  "referral",
      tags:    ["enterprise", "q4-priority"],
      notes:   "Key stakeholder. Decision maker for marketing budget.",
    });

    const james = createClient({
      workspace_id: workspaceId,
      name:    "James Okonkwo",
      company: "NovaTech Labs",
      email:   "james.o@novatech.io",
      phone:   "+44 7700 900123",
      status:  "active",
      source:  "email",
      tags:    ["saas", "trial"],
      notes:   "Interested in enterprise plan. Currently on trial.",
    });

    const ling = createClient({
      workspace_id: workspaceId,
      name:    "Ling Wei",
      company: "Stellar Commerce",
      email:   "lwei@stellarcommerce.com",
      status:  "lead",
      source:  "other",
      tags:    ["ecommerce", "new"],
    });

    const marco = createClient({
      workspace_id: workspaceId,
      name:    "Marco Ferreira",
      company: "Bright Growth Agency",
      email:   "marco@brightgrowth.co",
      phone:   "+351 912 345 678",
      status:  "active",
      source:  "referral",
      tags:    ["agency", "upsell"],
    });

    const priya = createClient({
      workspace_id: workspaceId,
      name:    "Priya Sharma",
      company: "HealthStream",
      email:   "priya.s@healthstream.io",
      status:  "lead",
      source:  "email",
      tags:    ["healthcare", "enterprise"],
    });

    // ── Conversations + Messages ───────────────────────────────────────────────

    const conv1 = createConversation({
      workspace_id: workspaceId,
      channel:      "email",
      external_id:  `demo_${workspaceId}_1`,
      title:        "Re: Q4 Enterprise Proposal",
      client_id:    sarah.id,
      status:       "open",
    });

    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString();

    createMessage({ workspace_id: workspaceId, conversation_id: conv1.id, sender_type: "client",
      content: "Hi, we reviewed your proposal and we have a few questions about the implementation timeline and support SLA.",
      created_at: daysAgo(3) });
    createMessage({ workspace_id: workspaceId, conversation_id: conv1.id, sender_type: "agent",
      sender_id: userId,
      content: "Hi Sarah, great to hear from you! Happy to clarify. Implementation typically takes 2 weeks with dedicated onboarding. Our SLA for enterprise is 4-hour response.",
      created_at: daysAgo(2) });
    createMessage({ workspace_id: workspaceId, conversation_id: conv1.id, sender_type: "client",
      content: "That sounds good. Can we schedule a call this week to finalise the contract terms?",
      created_at: daysAgo(1) });

    const conv2 = createConversation({
      workspace_id: workspaceId,
      channel:      "telegram",
      external_id:  `demo_${workspaceId}_2`,
      title:        "NovaTech Trial Questions",
      client_id:    james.id,
      status:       "open",
    });

    createMessage({ workspace_id: workspaceId, conversation_id: conv2.id, sender_type: "client",
      content: "Hey! Quick question — does the AI reply feature work with Gmail or only Telegram?",
      created_at: daysAgo(1) });
    createMessage({ workspace_id: workspaceId, conversation_id: conv2.id, sender_type: "agent",
      sender_id: userId,
      content: "Both! AI reply suggestions work across all connected channels — Gmail, Telegram, and more coming soon.",
      created_at: daysAgo(1) });

    const conv3 = createConversation({
      workspace_id: workspaceId,
      channel:      "email",
      external_id:  `demo_${workspaceId}_3`,
      title:        "Initial Outreach — Stellar Commerce",
      client_id:    ling.id,
      status:       "open",
    });

    createMessage({ workspace_id: workspaceId, conversation_id: conv3.id, sender_type: "agent",
      sender_id: userId,
      content: "Hi Ling, I noticed Stellar Commerce recently expanded into Europe. We help fast-growing e-commerce teams manage client communication with AI. Would a quick 20-minute call make sense?",
      created_at: daysAgo(5) });

    // ── Deals ─────────────────────────────────────────────────────────────────

    createDeal({
      workspace_id:    workspaceId,
      title:           "Apex Digital — Enterprise Licence",
      client_id:       sarah.id,
      stage_id:        stageMap["Negotiation"],
      value:           24000,
      currency:        "USD",
      probability:     75,
      expected_close:  new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      conversation_id: conv1.id,
      description:     "Annual enterprise deal. Decision pending on SLA terms.",
      created_by:      userId,
    });

    createDeal({
      workspace_id:    workspaceId,
      title:           "NovaTech Labs — Starter Plan",
      client_id:       james.id,
      stage_id:        stageMap["Proposal"],
      value:           3600,
      currency:        "USD",
      probability:     60,
      expected_close:  new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
      conversation_id: conv2.id,
      created_by:      userId,
    });

    createDeal({
      workspace_id:    workspaceId,
      title:           "Bright Growth — Agency Partnership",
      client_id:       marco.id,
      stage_id:        stageMap["Qualified"],
      value:           8400,
      currency:        "USD",
      probability:     40,
      expected_close:  new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
      created_by:      userId,
    });

    createDeal({
      workspace_id:    workspaceId,
      title:           "HealthStream — Pilot Programme",
      client_id:       priya.id,
      stage_id:        stageMap["Lead"],
      value:           12000,
      currency:        "USD",
      probability:     20,
      expected_close:  new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
      created_by:      userId,
    });

    // ── Tasks ─────────────────────────────────────────────────────────────────

    createTask({
      workspace_id: workspaceId,
      title:        "Send contract to Sarah Mitchell (Apex Digital)",
      description:  "Include the updated SLA appendix and Q4 pricing sheet.",
      status:       "todo",
      priority:     "high",
      due_date:     new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      client_id:    sarah.id,
      created_by:   userId,
    });

    createTask({
      workspace_id: workspaceId,
      title:        "Follow up with James re: NovaTech trial",
      status:       "todo",
      priority:     "medium",
      due_date:     new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      client_id:    james.id,
      created_by:   userId,
    });

    createTask({
      workspace_id: workspaceId,
      title:        "Research HealthStream's tech stack before call with Priya",
      status:       "todo",
      priority:     "medium",
      due_date:     new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      client_id:    priya.id,
      created_by:   userId,
    });

    // ── Mark onboarding steps complete ────────────────────────────────────────

    completeOnboardingStep(workspaceId, "import_clients");
    completeOnboardingStep(workspaceId, "create_deal");
    completeOnboardingStep(workspaceId, "create_task");

    // Mark workspace as created (it already exists at this point)
    completeOnboardingStep(workspaceId, "create_workspace");

    // Track event
    try {
      trackEvent({ workspaceId, userId, event: "demo_loaded" });
    } catch { /* non-fatal */ }

    // Record in DB that demo was seeded
    try {
      const db = getDb();
      db.prepare(
        `INSERT OR IGNORE INTO onboarding_progress (id, workspace_id, step, completed, completed_at)
         VALUES (?, ?, ?, 1, ?)`,
      ).run(randomUUID(), workspaceId, "demo_seeded", new Date().toISOString());
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      seeded: {
        clients:       5,
        conversations: 3,
        deals:         4,
        tasks:         3,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/demo/seed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
