export var API_ENDPOINTS = Object.freeze({
  collect: '/collect',
  collectReplay: '/collect-replay/replay',
  sessions: '/sessions',
  heatmap: '/analytics/heatmap',
});

export var CONVERSION_EVENT_KEYWORDS = Object.freeze([
  'checkout_complete',
  'converted',
  'demo_booked',
  'form_submitted',
  'lead_submitted',
  'order_complete',
  'purchase',
  'purchase_completed',
  'signup_completed',
  'subscription_started',
  'trial_started',
]);

export var BILLING_FEATURES = Object.freeze({
  sessionList: 'session_list',
  heatmaps: 'heatmaps',
  performance: 'performance',
  replay: 'replay',
  alerts: 'alerts',
  funnels: 'funnels',
  userFlow: 'user_flow',
  reports: 'reports',
  telegram: 'telegram',
  digest: 'digest',
});

var FREE_FEATURES = Object.freeze([
  BILLING_FEATURES.sessionList,
  BILLING_FEATURES.heatmaps,
  BILLING_FEATURES.performance,
]);

var PAID_FEATURES = Object.freeze([
  FREE_FEATURES[0],
  FREE_FEATURES[1],
  FREE_FEATURES[2],
  BILLING_FEATURES.replay,
  BILLING_FEATURES.alerts,
  BILLING_FEATURES.funnels,
  BILLING_FEATURES.userFlow,
  BILLING_FEATURES.reports,
  BILLING_FEATURES.telegram,
  BILLING_FEATURES.digest,
]);

export var DXM_PLAN_CATALOG = Object.freeze([
  Object.freeze({
    id: 'free',
    name: 'Free',
    description: 'Prove value on one real client site before you pay.',
    priceEtb: 0,
    sessions: 1000,
    sessionsLabel: 'Up to 1,000 sessions / month',
    siteLimit: 1,
    siteLimitLabel: '1 tracked client site',
    features: Object.freeze([
      '1 tracked client site',
      'Session list',
      'Heatmaps',
      'Basic performance view',
    ]),
    featureIds: FREE_FEATURES,
    highlight: false,
  }),
  Object.freeze({
    id: 'starter',
    name: 'Starter',
    description: 'The default paid tier for a small but active agency portfolio.',
    priceEtb: 1490,
    sessions: 10000,
    sessionsLabel: 'Up to 10,000 sessions / month',
    siteLimit: 5,
    siteLimitLabel: 'Up to 5 tracked client sites',
    features: Object.freeze([
      'Up to 5 tracked client sites',
      'Replay, alerts, funnels, and user flow',
      'Reports, Telegram alerts, and weekly digest',
    ]),
    featureIds: PAID_FEATURES,
    highlight: true,
  }),
  Object.freeze({
    id: 'pro',
    name: 'Pro',
    description: 'The same paid product bundle with more room for a growing portfolio.',
    priceEtb: 3490,
    sessions: 50000,
    sessionsLabel: 'Up to 50,000 sessions / month',
    siteLimit: 15,
    siteLimitLabel: 'Up to 15 tracked client sites',
    features: Object.freeze([
      'Up to 15 tracked client sites',
      'Everything in Starter',
      'Higher portfolio headroom for active agencies',
    ]),
    featureIds: PAID_FEATURES,
    highlight: false,
  }),
]);

export function getPlanCatalogEntry(planId) {
  return DXM_PLAN_CATALOG.find((plan) => plan.id === planId) || DXM_PLAN_CATALOG[0];
}

export function getNextPlanId(planId) {
  if (planId === 'starter') {
    return 'pro';
  }

  if (planId === 'pro') {
    return 'pro';
  }

  return 'starter';
}

export function getPlanSiteLimit(planId) {
  return getPlanCatalogEntry(planId).siteLimit;
}

export function planSupportsFeature(planId, featureId) {
  return getPlanCatalogEntry(planId).featureIds.includes(featureId);
}
