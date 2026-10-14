import { z } from 'zod';

/**
 * Site insights (slice 5). Every number here comes from the daily rollups the worker fills
 * (`rollup_*_day`); the API never scans raw events per request. Units follow @pulse/metrics:
 * ratios 0–1, durations integer ms, CLS unitless, health score 0–100.
 */

export const INSIGHT_RANGES = ['7d', '30d'] as const;
export const InsightsRange = z.enum(INSIGHT_RANGES);
export type InsightsRange = z.infer<typeof InsightsRange>;
export const InsightsQuery = z.object({ range: InsightsRange.default('7d') });

/** Below this many visits in a range, insights say "Not enough visits yet" instead of numbers. */
export const INSIGHTS_MIN_VISITS = 30;
/** Below this many samples, a Web Vital's p75 is shown as "not enough data". */
export const VITALS_MIN_SAMPLES = 5;

export const DEVICES = ['mobile', 'desktop', 'tablet'] as const;
/** `NetworkInformation.effectiveType` as the SDK reports it; `unknown` when the browser doesn't say. */
export const INSIGHT_NETWORKS = ['4g', '3g', '2g', 'unknown'] as const;
export type Device = (typeof DEVICES)[number];
export type InsightNetwork = (typeof INSIGHT_NETWORKS)[number];

/* ── Funnels ──────────────────────────────────────────────────────────────── */

/**
 * Patterns use `*` as the only wildcard (any characters, including `/`). No user regex: a glob is
 * matched with a linear-time matcher, so a pattern can never hang the worker.
 */
const glob = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => (s.match(/\*/g) ?? []).length <= 6, 'too_many_wildcards');

export const FunnelMatcher = z.discriminatedUnion('kind', [
  /** A page view whose path matches, e.g. `/checkout*`. */
  z.object({
    kind: z.literal('path'),
    glob: glob(200).refine((s) => s.startsWith('/') || s.startsWith('*')),
  }),
  /** A custom event sent with `dxm.track(name)`. Exact name. */
  z.object({ kind: z.literal('event'), name: z.string().trim().min(1).max(64) }),
  /** A click whose element selector matches, e.g. `*telebirr*`. */
  z.object({ kind: z.literal('click'), selector: glob(120) }),
  /** A form start or submit; `form` (a glob on the form's name) narrows it to one form. */
  z.object({
    kind: z.literal('form'),
    stage: z.enum(['start', 'submit']),
    form: glob(80).optional(),
  }),
]);
export type FunnelMatcher = z.infer<typeof FunnelMatcher>;

export const FunnelStep = z.object({
  label: z.string().trim().min(1).max(60),
  /** A visit reaches the step when any one of these matches (after it reached the step before). */
  match: z.array(FunnelMatcher).min(1).max(5),
});
export type FunnelStep = z.infer<typeof FunnelStep>;

export const FUNNEL_TEMPLATES = [
  'telebirr_checkout',
  'chapa_checkout',
  'lead_form',
  'telegram_handoff',
  'custom',
] as const;
export const FunnelTemplate = z.enum(FUNNEL_TEMPLATES);
export type FunnelTemplate = z.infer<typeof FunnelTemplate>;

export const FunnelConfig = z.object({
  name: z.string().trim().min(1).max(60),
  template: FunnelTemplate,
  steps: z.array(FunnelStep).min(2).max(8),
});
export type FunnelConfig = z.infer<typeof FunnelConfig>;
export type FunnelConfigInput = z.input<typeof FunnelConfig>;

/**
 * Ethiopian funnel templates. `labelKey` is an i18n key: the web app fills the step labels in the
 * owner's language when they pick a template; the stored config then holds plain labels.
 */
export interface FunnelTemplateDef {
  id: Exclude<FunnelTemplate, 'custom'>;
  nameKey: string;
  steps: { labelKey: string; match: FunnelMatcher[] }[];
}

const paid: FunnelMatcher[] = [
  { kind: 'event', name: 'purchase' },
  { kind: 'path', glob: '*/success*' },
  { kind: 'path', glob: '*thank*' },
  { kind: 'path', glob: '/order-complete*' },
];

export const FUNNEL_TEMPLATE_DEFS: readonly FunnelTemplateDef[] = [
  {
    id: 'telebirr_checkout',
    nameKey: 'funnel.template.telebirr_checkout',
    steps: [
      { labelKey: 'funnel.step.viewedProduct', match: [{ kind: 'path', glob: '/product*' }] },
      {
        labelKey: 'funnel.step.addedToCart',
        match: [
          { kind: 'event', name: 'add_to_cart' },
          { kind: 'path', glob: '/cart*' },
        ],
      },
      { labelKey: 'funnel.step.startedCheckout', match: [{ kind: 'path', glob: '/checkout*' }] },
      {
        labelKey: 'funnel.step.choseTelebirr',
        match: [
          { kind: 'event', name: 'telebirr_selected' },
          { kind: 'click', selector: '*telebirr*' },
        ],
      },
      { labelKey: 'funnel.step.paid', match: paid },
    ],
  },
  {
    id: 'chapa_checkout',
    nameKey: 'funnel.template.chapa_checkout',
    steps: [
      { labelKey: 'funnel.step.viewedProduct', match: [{ kind: 'path', glob: '/product*' }] },
      {
        labelKey: 'funnel.step.addedToCart',
        match: [
          { kind: 'event', name: 'add_to_cart' },
          { kind: 'path', glob: '/cart*' },
        ],
      },
      { labelKey: 'funnel.step.startedCheckout', match: [{ kind: 'path', glob: '/checkout*' }] },
      {
        labelKey: 'funnel.step.choseChapa',
        match: [
          { kind: 'event', name: 'chapa_selected' },
          { kind: 'click', selector: '*chapa*' },
        ],
      },
      { labelKey: 'funnel.step.paid', match: paid },
    ],
  },
  {
    id: 'lead_form',
    nameKey: 'funnel.template.lead_form',
    steps: [
      { labelKey: 'funnel.step.visited', match: [{ kind: 'path', glob: '*' }] },
      { labelKey: 'funnel.step.startedForm', match: [{ kind: 'form', stage: 'start' }] },
      { labelKey: 'funnel.step.sentForm', match: [{ kind: 'form', stage: 'submit' }] },
    ],
  },
  {
    id: 'telegram_handoff',
    nameKey: 'funnel.template.telegram_handoff',
    steps: [
      { labelKey: 'funnel.step.visited', match: [{ kind: 'path', glob: '*' }] },
      {
        labelKey: 'funnel.step.viewedOffer',
        match: [
          { kind: 'path', glob: '/product*' },
          { kind: 'path', glob: '/menu*' },
          { kind: 'path', glob: '/services*' },
        ],
      },
      {
        labelKey: 'funnel.step.openedTelegram',
        match: [
          { kind: 'event', name: 'telegram_click' },
          { kind: 'click', selector: '*telegram*' },
        ],
      },
    ],
  },
];

export const SiteFunnel = z.object({
  funnel: FunnelConfig.nullable(),
  updatedAt: z.string().nullable(),
});
export type SiteFunnel = z.infer<typeof SiteFunnel>;

/* ── Insights ─────────────────────────────────────────────────────────────── */

const count = z.number().int().min(0);
const ratio = z.number().min(0).max(1);
const ms = z.number().int().min(0);

/** A value for the chosen range and the same-length range before it (week-over-week for 7d). */
const compared = <T extends z.ZodType>(t: T) => z.object({ value: t, previous: t });

export const VitalRating = z.enum(['good', 'needs-work', 'poor']);

export const VitalSummary = z.object({
  /** p75 over one final value per page view; null below VITALS_MIN_SAMPLES. */
  p75: z.number().nullable(),
  previous: z.number().nullable(),
  samples: count,
  rating: VitalRating.nullable(),
});
export type VitalSummary = z.infer<typeof VitalSummary>;

export const VitalsBreakdown = z.object({
  lcp: z.number().nullable(),
  inp: z.number().nullable(),
  cls: z.number().nullable(),
  /** LCP samples (one per page view). */
  samples: count,
});

export const InsightPage = z.object({
  /** Page template: ids collapsed to `*`. */
  path: z.string(),
  visits: count,
  pageviews: count,
  /** Of visits that entered on this page and have ended, the share that saw only this page. */
  bounce: ratio.nullable(),
  lcp: ms.nullable(),
  frictionVisits: count,
  errorVisits: count,
  openFixes: z.object({ critical: count, watch: count }),
  /** Visits estimated to have had a bad time on this page; the ranking key. */
  need: z.number().min(0),
});
export type InsightPage = z.infer<typeof InsightPage>;

export const HealthParts = z.object({
  speed: ratio.nullable(),
  friction: ratio.nullable(),
  errors: ratio.nullable(),
});
export type HealthParts = z.infer<typeof HealthParts>;

export const SiteInsights = z.object({
  siteId: z.string(),
  range: InsightsRange,
  /** First and last UTC day in the range (YYYY-MM-DD); the last is today, so far. */
  from: z.string(),
  to: z.string(),
  /** When the newest rollup in the range was computed; null when nothing is rolled up yet. */
  updatedAt: z.string().nullable(),
  enoughData: z.boolean(),
  health: z.object({
    score: z.number().int().min(0).max(100).nullable(),
    previous: z.number().int().min(0).max(100).nullable(),
    parts: HealthParts,
  }),
  visits: z.object({ value: count, previous: count, trend: z.array(count) }),
  pageviews: compared(count),
  bounce: compared(ratio.nullable()),
  frictionRate: compared(ratio.nullable()),
  errorRate: compared(ratio.nullable()),
  vitals: z.object({ lcp: VitalSummary, inp: VitalSummary, cls: VitalSummary }),
  /** LCP p75 on phones: the number owners care about most. */
  lcpPhones: VitalSummary,
  byDevice: z.array(VitalsBreakdown.extend({ device: z.enum(DEVICES) })),
  byNetwork: z.array(VitalsBreakdown.extend({ network: z.enum(INSIGHT_NETWORKS) })),
  pages: z.array(InsightPage),
  /** Null when the site has no funnel set up. */
  funnel: z
    .object({
      name: z.string(),
      template: FunnelTemplate,
      /** True while the rollups still reflect an older step list (they're recomputed within the hour). */
      stale: z.boolean(),
      steps: z.array(z.object({ label: z.string(), count })),
      /** Index of the step with the biggest drop from the one before; null without a drop. */
      worst: z.number().int().nullable(),
      conversion: compared(ratio.nullable()),
      /** Conversion per day (null on days nobody entered the funnel). */
      trend: z.array(ratio.nullable()),
    })
    .nullable(),
});
export type SiteInsights = z.infer<typeof SiteInsights>;

/** Today's "this week" panel, across every site in the organization. */
export const WeekSummary = z.object({
  visits: z.object({ value: count, previous: count, trend: z.array(count) }),
  /** Funnel completion over sites that have a funnel; null when none does or nobody entered. */
  conversion: z
    .object({ value: ratio, previous: ratio.nullable(), trend: z.array(ratio.nullable()) })
    .nullable(),
  /** Fixes verified this calendar month (UTC) and last month. */
  verifiedThisMonth: compared(count),
});
export type WeekSummary = z.infer<typeof WeekSummary>;
