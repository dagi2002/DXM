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

export const isAiEnabled = () => {
  const rawValue = process.env.DXM_AI_ENABLED;
  if (!rawValue) return true;
  return !DISABLED_VALUES.has(rawValue.trim().toLowerCase());
};

/** Returns true when a valid Anthropic API key is present and AI is enabled. */
export const isLlmEnabled = () =>
  isAiEnabled() && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
