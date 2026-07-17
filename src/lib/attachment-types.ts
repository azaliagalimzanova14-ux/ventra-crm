/**
 * Shared attachment types — used across outbox, reply bar, API routes,
 * and the attachment bubble display component.
 */

// ── Core types ─────────────────────────────────────────────────────────────────

export type AttachmentKind = "image" | "pdf" | "document" | "voice";

export interface MessageAttachment {
  kind:       AttachmentKind;
  /** Display filename */
  name:       string;
  mimeType:   string;
  sizeBytes:  number;
  /**
   * Base64 data URL for in-thread preview.
   * Images: full image (< 512 KB) or thumbnail.
   * Voice: full audio blob for playback.
   * Documents: not set — show metadata chip only.
   */
  dataUrl?:   string;
  /** Voice/audio duration in seconds */
  duration?:  number;
}

// ── Kind detection ─────────────────────────────────────────────────────────────

const IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
]);

const VOICE_MIMES = new Set([
  "audio/ogg", "audio/webm", "audio/mp4", "audio/mpeg",
  "audio/wav", "audio/x-m4a", "audio/aac",
]);

export function kindFromMime(mime: string): AttachmentKind {
  const m = mime.toLowerCase();
  if (IMAGE_MIMES.has(m) || m.startsWith("image/"))                return "image";
  if (m === "application/pdf")                                       return "pdf";
  if (VOICE_MIMES.has(m) || m.startsWith("audio/"))                 return "voice";
  return "document";
}

export function kindFromFilename(filename: string): AttachmentKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg","jpeg","png","gif","webp","svg","bmp","tiff"].includes(ext)) return "image";
  if (ext === "pdf")                                                         return "pdf";
  if (["ogg","mp3","m4a","wav","aac","webm","opus"].includes(ext))           return "voice";
  return "document";
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** MIME type to use when creating a Blob for voice playback from a data URL */
export function audioMimeForPlayback(mimeType: string): string {
  // Prefer WebM/Opus — widest browser support for MediaRecorder output
  if (mimeType.includes("webm")) return "audio/webm";
  if (mimeType.includes("ogg"))  return "audio/ogg";
  if (mimeType.includes("mp4"))  return "audio/mp4";
  return mimeType;
}

/** File size limit (in bytes) below which we store the data URL in localStorage */
export const ATTACHMENT_DATAURL_LIMIT = 512 * 1024; // 512 KB
