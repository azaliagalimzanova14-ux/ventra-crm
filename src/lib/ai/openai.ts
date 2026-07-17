/**
 * src/lib/ai/openai.ts
 *
 * OpenAI-compatible provider implementation.
 *
 * Works with any OpenAI-compatible API: OpenAI, Azure OpenAI, Together,
 * Groq, Ollama (with openai-compat), Anthropic (via openai compat endpoint).
 *
 * Configure via env vars:
 *   OPENAI_API_KEY  — required for real calls
 *   AI_BASE_URL     — override base URL (default: https://api.openai.com/v1)
 *   AI_MODEL        — override model  (default: gpt-4o-mini)
 *
 * Server-only — do NOT import in client components.
 */

import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
  AIProviderConfig,
} from "./provider";

// ── OpenAI wire types ─────────────────────────────────────────────────────────

interface OpenAIMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface OpenAIRequest {
  model:             string;
  messages:          OpenAIMessage[];
  temperature?:      number;
  max_tokens?:       number;
  response_format?:  { type: "json_object" | "text" };
}

interface OpenAIChoice {
  message:       { role: string; content: string | null };
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens:     number;
  completion_tokens: number;
}

interface OpenAIResponse {
  id:      string;
  model:   string;
  choices: OpenAIChoice[];
  usage:   OpenAIUsage;
}

// ── Provider implementation ───────────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
  readonly name:  string = "openai";
  readonly model: string;

  private readonly apiKey:  string;
  private readonly baseUrl: string;

  constructor(config: AIProviderConfig) {
    this.apiKey  = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");  // strip trailing slash
    this.model   = config.model;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.isAvailable()) {
      throw new Error("AI provider not configured — set OPENAI_API_KEY");
    }

    const body: OpenAIRequest = {
      model:    this.model,
      messages: request.messages,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens   !== undefined) body.max_tokens   = request.maxTokens;
    if (request.jsonMode)                  body.response_format = { type: "json_object" };

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "unknown error");
      throw new Error(`AI API error ${resp.status}: ${text}`);
    }

    const data = await resp.json() as OpenAIResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("AI API returned no choices");
    }

    return {
      content:      choice.message.content ?? "",
      model:        data.model,
      provider:     this.name,
      inputTokens:  data.usage?.prompt_tokens     ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      finishReason: choice.finish_reason,
    };
  }
}
