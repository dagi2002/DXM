/**
 * Ask Pulse shared types — mirror the contract emitted by POST /ask.
 *
 * Kept in the component folder rather than `contracts/` because the shape is
 * entirely UI-local: nothing outside the AskPulse bundle needs them.
 */
export interface AskPulseCitation {
  kind: 'site' | 'alert' | 'funnel' | 'session';
  id: string;
  label: string;
}

export interface AskPulseToolCall {
  name: string;
  input: unknown;
  summary: string;
}

export interface AskPulseApiResponse {
  question: string;
  answer: string;
  citations: AskPulseCitation[];
  toolCalls: AskPulseToolCall[];
  mode: 'ai' | 'fallback';
}
