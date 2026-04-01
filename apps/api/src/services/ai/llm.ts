/**
 * LLM brief generator — wraps the Anthropic Claude API.
 * Called only when ANTHROPIC_API_KEY is set; falls back gracefully to null
 * so the deterministic engine takes over.
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

const getClient = (): Anthropic | null => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
};

const SYSTEM_PROMPT = `You are DXM Pulse AI — an agency intelligence engine embedded in a Digital Experience Management platform used by Ethiopian digital agencies.

Your role is to analyze website portfolio data and generate concise, actionable intelligence briefs that help agency operators understand what is happening across their client sites and what to do next.

Rules:
- Always respond with ONLY valid JSON matching the schema provided in the user message. No prose, no markdown, no code fences — raw JSON only.
- Be direct, professional, and specific. Never use vague language like "consider" or "may".
- Recommendations must be actionable with a clear next step.
- Headline should be one sentence, max 12 words.
- Summary should be 1-2 sentences of operational insight.
- Evidence items use tone: "positive", "warning", or "neutral".
- Recommendation priority: "high" for immediate action, "medium" for this week, "low" for backlog.`;

/**
 * Call Claude to generate an AI brief of type T.
 * Returns null on any failure so callers can fall back to deterministic generation.
 */
export const generateBriefWithLLM = async <T>(
  schemaDescription: string,
  contextData: unknown,
): Promise<T | null> => {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate a JSON object matching this schema:\n${schemaDescription}\n\nContext data:\n${JSON.stringify(contextData, null, 2)}`,
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== 'text') return null;

    // Strip any accidental markdown fences
    const raw = block.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Extract the first JSON object from the response
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};
