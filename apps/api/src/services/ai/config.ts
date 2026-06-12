const DISABLED_VALUES = new Set(['0', 'false', 'off']);

export const OVERVIEW_AI_VERSION = 'overview-ai-v1';
export const OVERVIEW_AI_PERIOD = '7d';
export const OVERVIEW_AI_TTL_HOURS = 24;
export const SITE_AI_VERSION = 'site-ai-v1';
export const SITE_AI_PERIOD = '7d';
export const SITE_AI_TTL_HOURS = 24;
export const ALERT_AI_VERSION = 'alert-ai-v1';
export const ALERT_AI_PERIOD = 'current';
export const ALERT_AI_TTL_HOURS = 24;
export const FUNNEL_AI_VERSION = 'funnel-ai-v1';
export const FUNNEL_AI_TTL_HOURS = 24;
export const SESSION_AI_VERSION = 'session-ai-v1';
export const SESSION_AI_PERIOD = 'single';
export const SESSION_AI_TTL_HOURS = 24 * 7; // session events are immutable after completion
export const ASK_PULSE_AI_VERSION = 'ask-pulse-v1';

/**
 * Central model pin for all Claude calls (Ask Pulse, session summaries, briefs).
 * Override via DXM_AI_MODEL to pilot a newer snapshot without touching code.
 */
export const CLAUDE_MODEL = (process.env.DXM_AI_MODEL || 'claude-haiku-4-5-20251001').trim();

export const isAiEnabled = () => {
  const rawValue = process.env.DXM_AI_ENABLED;
  if (!rawValue) return true;
  return !DISABLED_VALUES.has(rawValue.trim().toLowerCase());
};

/** Returns true when a valid Anthropic API key is present and AI is enabled. */
export const isLlmEnabled = () =>
  isAiEnabled() && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
