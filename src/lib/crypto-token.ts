/**
 * src/lib/crypto-token.ts
 *
 * AES-256-GCM encryption/decryption for Telegram bot tokens.
 *
 * Key source (in priority order):
 *   1. VENTRA_ENCRYPTION_KEY env var — 64 hex chars (32 bytes)
 *   2. Dev fallback derived from cwd — NOT production safe (logs a warning)
 *
 * Generate a production key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Stored format (colon-delimited hex):
 *   {12-byte IV hex}:{16-byte auth tag hex}:{ciphertext hex}
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM      = "aes-256-gcm" as const;
const IV_BYTES       = 12;
const KEY_BYTES      = 32;

// ── Key resolution ─────────────────────────────────────────────────────────────
//
// The key is resolved once and cached. It never changes at runtime:
//   - In production it comes from the VENTRA_ENCRYPTION_KEY env var (set at deploy time).
//   - In dev it is deterministically derived from cwd (same across process lifetime).
// Caching avoids re-parsing the hex env var on every encrypt/decrypt call.

let _cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const envKey = process.env.VENTRA_ENCRYPTION_KEY;

  if (envKey && envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    _cachedKey = Buffer.from(envKey, "hex");
    return _cachedKey;
  }

  if (process.env.NODE_ENV !== "production") {
    // Dev fallback: deterministic key from cwd — acceptable for local dev only
    _cachedKey = Buffer.from(
      ("ventra_dev_key_" + process.cwd()).slice(0, KEY_BYTES).padEnd(KEY_BYTES, "0"),
    );
    return _cachedKey;
  }

  throw new Error(
    "[Ventra] VENTRA_ENCRYPTION_KEY is required in production. " +
    "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Encrypt a plaintext Telegram bot token. Returns a colon-delimited hex string. */
export function encryptToken(plaintext: string): string {
  const key    = resolveKey();
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/** Decrypt a token previously encrypted by encryptToken. Throws on tamper/wrong key. */
export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format — expected iv:tag:ciphertext");
  }

  const [ivHex, tagHex, ctHex] = parts as [string, string, string];
  const key     = resolveKey();
  const iv      = Buffer.from(ivHex, "hex");
  const tag     = Buffer.from(tagHex, "hex");
  const ct      = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
