/**
 * POST /api/integrations/telegram/webhook
 *
 * Legacy catch-all webhook for the "default" workspace.
 * Handles any existing Telegram webhook registrations pointing to the
 * un-parameterised path. New deployments should use /webhook/[wsId] instead
 * (that URL is what getWebhookUrl() generates).
 *
 * All parsing, validation, and persistence logic lives in
 * src/lib/telegram-webhook-handler.ts — shared with the parameterised route.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleWebhookUpdate }       from "@/lib/telegram-webhook-handler";

const DEFAULT_WS = "default";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleWebhookUpdate(DEFAULT_WS, req);
}
