/**
 * src/lib/ai/provider.ts
 *
 * Provider interface for AI LLM backends.
 *
 * Any OpenAI-compatible API (OpenAI, Azure OpenAI, Together, Groq, Ollama,
 * Anthropic via openai-compat, etc.) can be wired in by implementing AIProvider.
 *
 * Do NOT import this in client components — server-only.
 */

// ── Core types ────────────────────────────────────────────────────────────────

export interface AIMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  messages:    AIMessage[];
  temperature?: number;   // 0–2, default 0.7
  maxTokens?:  number;    // default provider-defined
  jsonMode?:   boolean;   // request JSON output format
}

export interface AICompletionResponse {
  content:    string;
  model:      string;
  provider:   string;
  inputTokens:  number;
  outputTokens: number;
  finishReason: string;
}

/**
 * AI provider interface. Implement this for each LLM backend.
 * The service layer calls complete() — providers handle auth, retry, etc.
 */
export interface AIProvider {
  readonly name:  string;   // e.g. "openai", "anthropic", "ollama"
  readonly model: string;   // model identifier used in API calls

  /**
   * Send a chat completion request and return the response.
   * Throws if the request fails after retries.
   */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;

  /**
   * Returns true if the provider is configured (API key present, etc.).
   * Used to gracefully degrade when AI is not set up.
   */
  isAvailable(): boolean;
}

// ── Config helper ─────────────────────────────────────────────────────────────

export interface AIProviderConfig {
  apiKey:  string;
  baseUrl: string;
  model:   string;
}

/**
 * Read AI provider config from environment variables.
 * Falls back to OpenAI defaults if not set.
 *
 * Env vars:
 *   OPENAI_API_KEY   — API key (required for real AI calls)
 *   AI_BASE_URL      — Base URL (default: https://api.openai.com/v1)
 *   AI_MODEL         — Model name (default: gpt-4o-mini)
 */
export function getProviderConfig(): AIProviderConfig {
  return {
    apiKey:  process.env.OPENAI_API_KEY  ?? "",
    baseUrl: process.env.AI_BASE_URL     ?? "https://api.openai.com/v1",
    model:   process.env.AI_MODEL        ?? "gpt-4o-mini",
  };
}
