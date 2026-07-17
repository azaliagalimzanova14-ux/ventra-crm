/**
 * GET /api/integrations/telegram/file/[wsId]/[fileId]
 *
 * Server-side file proxy for Telegram attachments.
 *
 * Flow:
 *   1. Look up the bot token for the workspace from the DB (never sent to client).
 *   2. Call Telegram's getFile API to resolve file_id → file_path.
 *   3. Fetch the file bytes from Telegram's CDN using the bot token.
 *   4. Stream the bytes back to the browser with the correct Content-Type.
 *
 * Security:
 *   - The bot token stays server-side — it never appears in any response.
 *   - fileId is a Telegram-issued opaque string; guessing valid IDs is not feasible.
 *
 * Usage:
 *   Set MessageAttachment.dataUrl = `/api/integrations/telegram/file/{wsId}/{fileId}`
 *   AttachmentBubble uses this as <img src>, <audio src>, or <a href download> — all
 *   work transparently with a regular URL (no base64 required).
 */

import { NextRequest, NextResponse } from "next/server";
import { getBotToken }               from "@/lib/telegram-db";

// Telegram returns at most 20 MB via getFile; cap our proxy at 25 MB to be safe.
const MAX_BYTES = 25 * 1024 * 1024;

interface GetFileResult {
  ok:     boolean;
  result: {
    file_id:        string;
    file_unique_id: string;
    file_size?:     number;
    file_path?:     string;
  };
}

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ wsId: string; fileId: string }> },
): Promise<Response> {
  const { wsId, fileId } = await context.params;

  // ── 1. Resolve bot token ──────────────────────────────────────────────────
  const token = getBotToken(wsId);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "No bot configured for this workspace" },
      { status: 404 },
    );
  }

  // ── 2. Call Telegram getFile to get file_path ─────────────────────────────
  let filePath: string;
  try {
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { cache: "no-store" },
    );

    if (!getFileRes.ok) {
      const errText = await getFileRes.text().catch(() => "");
      console.error("[telegram/file] getFile failed:", getFileRes.status, errText);
      return NextResponse.json(
        { ok: false, error: "Telegram getFile failed" },
        { status: 502 },
      );
    }

    const getFileJson = (await getFileRes.json()) as GetFileResult;

    if (!getFileJson.ok || !getFileJson.result.file_path) {
      return NextResponse.json(
        { ok: false, error: "Telegram returned no file_path" },
        { status: 502 },
      );
    }

    filePath = getFileJson.result.file_path;
  } catch (err) {
    console.error("[telegram/file] getFile network error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to contact Telegram API" },
      { status: 502 },
    );
  }

  // ── 3. Fetch the file from Telegram's CDN ─────────────────────────────────
  let telegramRes: globalThis.Response;
  try {
    telegramRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      { cache: "no-store" },
    );

    if (!telegramRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Telegram file download failed" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[telegram/file] file download error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to download file from Telegram" },
      { status: 502 },
    );
  }

  // ── 4. Infer Content-Type ─────────────────────────────────────────────────
  // Prefer the header Telegram sends; fall back to extension sniffing.
  const contentType =
    telegramRes.headers.get("content-type") ??
    mimeFromPath(filePath) ??
    "application/octet-stream";

  // ── 5. Guard against oversized files ─────────────────────────────────────
  const contentLength = telegramRes.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File too large to proxy (>25 MB)" },
      { status: 413 },
    );
  }

  // ── 6. Stream the body back to the browser ────────────────────────────────
  // Use the filename from the Telegram file path (last path segment).
  const filename = filePath.split("/").pop() ?? "file";

  const headers = new Headers({
    "Content-Type":                contentType,
    "Content-Disposition":         `inline; filename="${filename}"`,
    "Cache-Control":               "private, max-age=3600",
    "X-Content-Type-Options":      "nosniff",
  });

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(telegramRes.body, { status: 200, headers });
}

// ── MIME sniffing from file path extension ────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  gif:  "image/gif",
  webp: "image/webp",
  pdf:  "application/pdf",
  ogg:  "audio/ogg",
  oga:  "audio/ogg",
  opus: "audio/ogg",
  mp3:  "audio/mpeg",
  m4a:  "audio/mp4",
  mp4:  "video/mp4",
  wav:  "audio/wav",
  webm: "audio/webm",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt:  "text/plain",
  zip:  "application/zip",
};

function mimeFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? null;
}
