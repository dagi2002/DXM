import { FUNNEL_TEMPLATE_DEFS, FunnelConfig, LOGO_MAX_BYTES } from '@pulse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { siteFunnelQuery } from '../lib/queries';
import { createTestI18n, withI18n } from '../test/i18n';
import { logoProblem } from './branding-editor';
import FunnelEditorDialog, { fromDraft, moveStep, stepError, toDraft, type DraftStep } from './funnel-editor';
import { sampleRateOptions } from './replay-settings';

let en: Awaited<ReturnType<typeof createTestI18n>>;
beforeAll(async () => {
  en = await createTestI18n('en');
});
afterEach(() => vi.restoreAllMocks());

const step = (over: Partial<DraftStep> = {}): DraftStep => ({
  key: 'k',
  label: 'Paid',
  kind: 'path',
  value: '/thanks*',
  extras: [],
  ...over,
});

describe('funnel editor model', () => {
  it('round-trips every template through the editor without losing rules', () => {
    for (const def of FUNNEL_TEMPLATE_DEFS) {
      const config = {
        name: def.id,
        template: def.id,
        steps: def.steps.map((s) => ({ label: s.labelKey, match: s.match })),
      };
      const back = fromDraft(config.name, toDraft(config));
      expect(back.template).toBe('custom');
      expect(back.steps.map((s) => s.label)).toEqual(config.steps.map((s) => s.label));
      // Same rules (the editable one moves first).
      for (const [i, s] of back.steps.entries()) {
        expect(new Set(s.match.map((m) => JSON.stringify(m)))).toEqual(
          new Set(config.steps[i]!.match.map((m) => JSON.stringify(m))),
        );
      }
      expect(FunnelConfig.safeParse(back).success).toBe(true);
    }
  });

  it('turns form/click-only steps into an empty page field plus kept extras', () => {
    const [s] = toDraft({
      name: 'x',
      template: 'custom',
      steps: [
        { label: 'Started', match: [{ kind: 'form', stage: 'start' }] },
        { label: 'Sent', match: [{ kind: 'event', name: 'sent' }] },
      ],
    });
    expect(s).toMatchObject({ kind: 'path', value: '', extras: [{ kind: 'form', stage: 'start' }] });
    expect(stepError(s!)).toBeUndefined();
  });

  it('explains what is wrong with a step', () => {
    expect(stepError(step({ label: ' ' }))).toBe('label');
    expect(stepError(step({ value: '' }))).toBe('value');
    expect(stepError(step({ value: 'checkout' }))).toBe('path');
    expect(stepError(step({ value: '/a*b*c*d*e*f*g*' }))).toBe('wildcards');
    expect(stepError(step({ kind: 'event', value: 'purchase' }))).toBeUndefined();
    expect(stepError(step({ value: '*thank*' }))).toBeUndefined();
  });

  it('moves steps up and down and ignores moves past the ends', () => {
    const a = step({ key: 'a' });
    const b = step({ key: 'b' });
    const c = step({ key: 'c' });
    expect(moveStep([a, b, c], 1, -1).map((s) => s.key)).toEqual(['b', 'a', 'c']);
    expect(moveStep([a, b, c], 1, 1).map((s) => s.key)).toEqual(['a', 'c', 'b']);
    const same = [a, b, c];
    expect(moveStep(same, 0, -1)).toBe(same);
    expect(moveStep(same, 2, 1)).toBe(same);
  });
});

describe('sample rate options', () => {
  it('formats rates through @pulse/metrics and keeps an unusual stored rate selectable', () => {
    expect(sampleRateOptions(1, 'en', 'Off')).toEqual([
      { id: '1', label: '100%' },
      { id: '0.5', label: '50%' },
      { id: '0.25', label: '25%' },
      { id: '0.1', label: '10%' },
      { id: '0', label: 'Off' },
    ]);
    expect(sampleRateOptions(0.3, 'en', 'Off').map((o) => o.id)).toEqual([
      '1',
      '0.5',
      '0.3',
      '0.25',
      '0.1',
      '0',
    ]);
  });
});

describe('logo checks before upload', () => {
  it('matches the API limits', () => {
    expect(logoProblem({ type: 'image/png', size: 10 })).toBeUndefined();
    expect(logoProblem({ type: 'image/webp', size: LOGO_MAX_BYTES })).toBeUndefined();
    expect(logoProblem({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toBe('size');
    expect(logoProblem({ type: 'image/png', size: 0 })).toBe('size');
    expect(logoProblem({ type: 'image/svg+xml', size: 10 })).toBe('type');
    expect(logoProblem({ type: 'image/gif', size: 10 })).toBe('type');
  });
});

describe('<FunnelEditorDialog>', () => {
  function renderEditor() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(siteFunnelQuery('org_1', 'site_1').queryKey, {
      funnel: {
        name: 'Checkout',
        template: 'custom',
        steps: [
          { label: 'Cart', match: [{ kind: 'path', glob: '/cart*' }] },
          { label: 'Checkout', match: [{ kind: 'path', glob: '/checkout*' }] },
          { label: 'Paid', match: [{ kind: 'event', name: 'purchase' }] },
        ],
      },
      updatedAt: null,
    });
    const I18n = withI18n(en);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <I18n>{children}</I18n>
      </QueryClientProvider>
    );
    return render(<FunnelEditorDialog orgId="org_1" siteId="site_1" isOpen onOpenChange={() => {}} />, {
      wrapper,
    });
  }

  it('reorders by keyboard, keeps focus on the moved step and announces it', async () => {
    renderEditor();
    const list = await screen.findByRole('list', { name: 'Funnel steps' });
    const down = within(list).getByRole('button', { name: 'Move “Cart” down' });
    down.focus();
    fireEvent.click(down);
    await waitFor(() =>
      expect(
        within(list)
          .getAllByLabelText('Step name')
          .map((i) => (i as HTMLInputElement).value),
      ).toEqual(['Checkout', 'Cart', 'Paid']),
    );
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'Move “Cart” down' }));
    expect(screen.getByRole('status').textContent).toBe('“Cart” is now step 2 of 3.');
    // First step can't move up, last can't move down; two steps is the minimum.
    expect(within(list).getByRole('button', { name: 'Move “Checkout” up' })).toBeDisabled();
    expect(within(list).getByRole('button', { name: 'Move “Paid” down' })).toBeDisabled();
  });

  it('saves the edited steps as a custom funnel', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ funnel: null, updatedAt: null }), { status: 200 }));
    renderEditor();
    const list = await screen.findByRole('list', { name: 'Funnel steps' });
    fireEvent.click(within(list).getByRole('button', { name: 'Remove “Checkout”' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save funnel' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/v1/sites/site_1/funnel');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Checkout',
      template: 'custom',
      steps: [
        { label: 'Cart', match: [{ kind: 'path', glob: '/cart*' }] },
        { label: 'Paid', match: [{ kind: 'event', name: 'purchase' }] },
      ],
    });
  });

  it('refuses to save a step with no page or event and says why', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderEditor();
    const list = await screen.findByRole('list', { name: 'Funnel steps' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    const names = within(list).getAllByLabelText('Step name');
    await waitFor(() => expect(document.activeElement).toBe(names[3]));
    fireEvent.change(names[3]!, { target: { value: 'Reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save funnel' }));
    expect(await screen.findByText('Add a page address or an event name.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
