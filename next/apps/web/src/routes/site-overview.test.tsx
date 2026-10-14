import type { SiteInsights } from '@pulse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { siteInsightsQuery } from '../lib/queries';
import { createTestI18n, withI18n } from '../test/i18n';
import { SiteOverview } from './site-overview';

let en: Awaited<ReturnType<typeof createTestI18n>>;
let am: Awaited<ReturnType<typeof createTestI18n>>;
beforeAll(async () => {
  en = await createTestI18n('en');
  am = await createTestI18n('am');
});
afterEach(() => vi.restoreAllMocks());

const vital = (p75: number | null, rating: 'good' | 'needs-work' | 'poor' | null, samples = 40) => ({
  p75,
  previous: null,
  samples,
  rating,
});

const quiet: SiteInsights = {
  siteId: 'site_1',
  range: '7d',
  from: '2026-10-08',
  to: '2026-10-14',
  updatedAt: null,
  enoughData: false,
  health: { score: null, previous: null, parts: { speed: null, friction: null, errors: null } },
  visits: { value: 4, previous: 0, trend: [0, 0, 0, 0, 0, 0, 4] },
  pageviews: { value: 9, previous: 0 },
  bounce: { value: null, previous: null },
  frictionRate: { value: 0, previous: null },
  errorRate: { value: 0, previous: null },
  vitals: { lcp: vital(null, null, 2), inp: vital(null, null, 0), cls: vital(null, null, 0) },
  lcpPhones: vital(null, null, 1),
  byDevice: [],
  byNetwork: [],
  pages: [],
  funnel: null,
};

const busy: SiteInsights = {
  ...quiet,
  updatedAt: new Date().toISOString(),
  enoughData: true,
  health: { score: 62, previous: 79, parts: { speed: 0.6, friction: 0.5, errors: 0.9 } },
  visits: { value: 840, previous: 800, trend: [100, 120, 110, 130, 120, 130, 130] },
  bounce: { value: 0.3, previous: 0.28 },
  vitals: { lcp: vital(3100, 'needs-work'), inp: vital(180, 'good'), cls: vital(0.3, 'poor') },
  lcpPhones: vital(3400, 'needs-work'),
  byDevice: [{ device: 'mobile', lcp: 3400, inp: 200, cls: 0.1, samples: 30 }],
  byNetwork: [
    { network: '4g', lcp: 2100, inp: null, cls: null, samples: 20 },
    { network: '3g', lcp: 5400, inp: null, cls: null, samples: 10 },
  ],
  pages: [
    {
      path: '/checkout',
      visits: 236,
      pageviews: 300,
      bounce: 0.12,
      lcp: 2400,
      frictionVisits: 40,
      errorVisits: 3,
      openFixes: { critical: 1, watch: 0 },
      need: 43,
    },
  ],
  funnel: {
    name: 'telebirr checkout',
    template: 'telebirr_checkout',
    stale: false,
    steps: [
      { label: 'Viewed a product', count: 400 },
      { label: 'Started checkout', count: 200 },
      { label: 'Paid', count: 50 },
    ],
    worst: 2,
    conversion: { value: 0.125, previous: 0.2 },
    trend: [0.1, 0.12, null, 0.13, 0.12, 0.13, 0.125],
  },
};

function setup(data: SiteInsights, canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(siteInsightsQuery('org_1', 'site_1', '7d').queryKey, data);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper, props: { orgId: 'org_1', siteId: 'site_1', locale: 'en' as const, canEdit } };
}

describe('SiteOverview', () => {
  it('says there are not enough visits instead of showing a score', () => {
    const { Wrapper, props } = setup(quiet);
    const I18n = withI18n(en);
    render(
      <I18n>
        <Wrapper>
          <SiteOverview {...props} />
        </Wrapper>
      </I18n>,
    );
    expect(screen.getByRole('heading', { level: 2, name: /Collecting visits/ })).toBeInTheDocument();
    expect(screen.getByText(/Not enough visits yet: 4 visits in this period/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Health \d+ of 100/)).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.getByText('Not enough speed data yet', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Pages show up here once enough people have visited.')).toBeInTheDocument();
    // No funnel yet: a manager can set one up from a template.
    expect(screen.getByRole('button', { name: 'Set up funnel' })).toBeInTheDocument();
  });

  it('renders real numbers: health, funnel drop, speed by network and the pages that need you', () => {
    const { Wrapper, props } = setup(busy);
    const I18n = withI18n(en);
    render(
      <I18n>
        <Wrapper>
          <SiteOverview {...props} />
        </Wrapper>
      </I18n>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'A few things are getting in visitors’ way.' }));
    expect(screen.getByText('/checkout needs the most attention.')).toBeInTheDocument();
    expect(screen.getByLabelText('Health 62 of 100')).toBeInTheDocument();
    expect(screen.getByText('since last week')).toBeInTheDocument();
    expect(screen.getByText('75% lost at Paid')).toBeInTheDocument();
    expect(screen.getByText('telebirr checkout completion')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('3G')).toBeInTheDocument();
    expect(screen.getByText('5.4 s')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument(); // CLS rating, in words
    expect(screen.getByText('40 stuck · 3 with errors')).toBeInTheDocument();
    expect(screen.getByText('1 critical · 0 to watch')).toBeInTheDocument();
  });

  it('reads members a funnel they cannot change', () => {
    const { Wrapper, props } = setup({ ...quiet }, false);
    const I18n = withI18n(am);
    render(
      <I18n>
        <Wrapper>
          <SiteOverview {...props} locale="am" />
        </Wrapper>
      </I18n>,
    );
    expect(screen.queryByRole('button', { name: 'ፋነል አዘጋጅ' })).toBeNull();
    expect(screen.getByText('እስካሁን ፋነል የለም። ባለቤት ወይም አስተዳዳሪ ሊያዘጋጅ ይችላል።')).toBeInTheDocument();
  });

  it('sets up a funnel from a template with step labels in the owner’s language', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ funnel: null, updatedAt: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { Wrapper, props } = setup(quiet);
    const I18n = withI18n(am);
    render(
      <I18n>
        <Wrapper>
          <SiteOverview {...props} locale="am" />
        </Wrapper>
      </I18n>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ፋነል አዘጋጅ' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/v1/sites/site_1/funnel');
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.name).toBe('የtelebirr ክፍያ');
    expect(body.template).toBe('telebirr_checkout');
    expect(body.steps.map((s: { label: string }) => s.label)).toEqual([
      'ምርት አዩ',
      'ወደ ጋሪ ጨመሩ',
      'ክፍያ ጀመሩ',
      'telebirrን መረጡ',
      'ከፈሉ',
    ]);
  });
});
