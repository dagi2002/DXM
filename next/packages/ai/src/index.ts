/**
 * The model client and the small, pure pieces of each AI task (ADR-009): prompts, input shaping
 * and output parsing. Callers own caching and the per-org budget. Every task treats data from
 * visitors' browsers as untrusted and fences it in <data>.
 */
export interface AiCompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiClient {
  complete(req: { system: string; prompt: string; maxTokens: number }): Promise<AiCompletion>;
}

/** Anthropic Messages API over fetch. The key is a secret: only ever a request header. */
export class AnthropicClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}
  async complete(req: { system: string; prompt: string; maxTokens: number }): Promise<AiCompletion> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const body = (await res.json()) as {
      model?: string;
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (body.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join(''),
      model: body.model ?? this.model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  }
}

export * from './util';
export * from './replay-recap';
