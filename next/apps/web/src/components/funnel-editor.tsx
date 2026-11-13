/**
 * Step-by-step funnel editor (task 13). Lazy-loaded by the site Overview when an owner or admin
 * opens it. Each step is a name plus a page address or an event; template rules that aren't a
 * page or an event (clicks, forms) stay attached to their step and can be removed. Templates are
 * starting points: picking one replaces the draft.
 *
 * Keyboard: every control is a native button or field. "Move up/down" keep focus on the moved
 * step, and a live region says where it went, so reordering works without a pointer.
 */
import {
  FUNNEL_TEMPLATE_DEFS,
  FunnelConfig,
  type FunnelMatcher,
  type FunnelConfig as FunnelConfigT,
} from '@pulse/contracts';
import { Banner, Button, IconButton, Modal, Segmented, Select, Skeleton, TextField } from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { siteFunnelQuery } from '../lib/queries';
import { useTemplateConfig } from '../lib/funnels';

export const MIN_STEPS = 2;
export const MAX_STEPS = 8;

export interface DraftStep {
  key: string;
  label: string;
  kind: 'path' | 'event';
  value: string;
  /** Rules the editor doesn't edit (clicks, forms, extra pages/events). Kept unless removed. */
  extras: FunnelMatcher[];
}

let nextKey = 0;
const newKey = () => `s${++nextKey}`;

/** Stored config → editable steps. The first page/event rule becomes the editable one. */
export function toDraft(config: FunnelConfigT): DraftStep[] {
  return config.steps.map((s) => {
    const i = s.match.findIndex((m) => m.kind === 'path' || m.kind === 'event');
    const main = s.match[i];
    const extras = s.match.filter((_, j) => j !== i);
    if (main?.kind === 'path')
      return { key: newKey(), label: s.label, kind: 'path', value: main.glob, extras };
    if (main?.kind === 'event')
      return { key: newKey(), label: s.label, kind: 'event', value: main.name, extras };
    return { key: newKey(), label: s.label, kind: 'path', value: '', extras };
  });
}

/** Editable steps → the config the API takes (validated by the same Zod schema). */
export function fromDraft(name: string, steps: DraftStep[]): FunnelConfigT {
  return {
    name: name.trim(),
    template: 'custom',
    steps: steps.map((s) => {
      const value = s.value.trim();
      const main: FunnelMatcher[] = !value
        ? []
        : s.kind === 'path'
          ? [{ kind: 'path', glob: value }]
          : [{ kind: 'event', name: value }];
      return { label: s.label.trim(), match: [...main, ...s.extras].slice(0, 5) };
    }),
  };
}

export type StepError = 'label' | 'value' | 'path' | 'wildcards' | undefined;

/** Plain-language problems per step, before the API is asked. */
export function stepError(s: DraftStep): StepError {
  if (!s.label.trim()) return 'label';
  const v = s.value.trim();
  if (!v) return s.extras.length ? undefined : 'value';
  if (s.kind === 'path' && !v.startsWith('/') && !v.startsWith('*')) return 'path';
  if ((v.match(/\*/g) ?? []).length > 6) return 'wildcards';
  return undefined;
}

/** Moves one step; returns the new order. Out-of-range moves are no-ops. */
export function moveStep(steps: DraftStep[], index: number, by: -1 | 1): DraftStep[] {
  const to = index + by;
  if (to < 0 || to >= steps.length) return steps;
  const out = [...steps];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

function useExtraLabel() {
  const { t } = useTranslation();
  return (m: FunnelMatcher) =>
    m.kind === 'path'
      ? t('funnel.editor.extra.path', { value: m.glob })
      : m.kind === 'event'
        ? t('funnel.editor.extra.event', { value: m.name })
        : m.kind === 'click'
          ? t('funnel.editor.extra.click', { value: m.selector })
          : t(`funnel.editor.extra.form.${m.stage}`, { value: m.form ?? '*' });
}

function Editor({
  orgId,
  siteId,
  initial,
  onDone,
}: {
  orgId: string;
  siteId: string;
  initial: FunnelConfigT | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toConfig = useTemplateConfig();
  const extraLabel = useExtraLabel();
  const start = initial ?? toConfig('lead_form')!;
  const [name, setName] = useState(initial ? start.name : t('funnel.editor.defaultName'));
  const [steps, setSteps] = useState<DraftStep[]>(() => toDraft(start));
  const [template, setTemplate] = useState<string>('');
  const [showErrors, setShowErrors] = useState(false);
  const [announce, setAnnounce] = useState('');
  const focusNext = useRef<{ key: string; action: string } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const f = focusNext.current;
    if (!f || !list.current) return;
    focusNext.current = null;
    const item = list.current.querySelector<HTMLElement>(`[data-step="${f.key}"]`);
    // After a move the same button keeps focus; at the top or bottom it is disabled, so the
    // other move button (or the step's name field) takes it.
    const target =
      f.action === 'label'
        ? item?.querySelector<HTMLElement>('input')
        : (item?.querySelector<HTMLElement>(`[data-action="${f.action}"] button:not([disabled])`) ??
          item?.querySelector<HTMLElement>('[data-action] button:not([disabled])') ??
          item?.querySelector<HTMLElement>('input'));
    target?.focus();
  }, [steps]);

  const save = useMutation({
    mutationFn: (config: FunnelConfigT) => api(`/sites/${siteId}/funnel`, { method: 'PUT', body: config }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites', siteId] });
      onDone();
    },
  });

  const update = (key: string, patch: Partial<DraftStep>) =>
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, by: -1 | 1) => {
    const step = steps[index]!;
    const next = moveStep(steps, index, by);
    if (next === steps) return;
    focusNext.current = { key: step.key, action: by < 0 ? 'up' : 'down' };
    setSteps(next);
    setAnnounce(
      t('funnel.editor.moved', {
        label: step.label || t('funnel.editor.stepN', { n: index + 1 }),
        n: index + by + 1,
        total: steps.length,
      }),
    );
  };
  const remove = (index: number) => {
    const step = steps[index]!;
    const next = steps.filter((_, i) => i !== index);
    const neighbour = next[Math.min(index, next.length - 1)];
    if (neighbour) focusNext.current = { key: neighbour.key, action: 'remove' };
    setSteps(next);
    setAnnounce(
      t('funnel.editor.removed', { label: step.label || t('funnel.editor.stepN', { n: index + 1 }) }),
    );
  };
  const add = () => {
    const step: DraftStep = { key: newKey(), label: '', kind: 'path', value: '', extras: [] };
    focusNext.current = { key: step.key, action: 'label' };
    setSteps((all) => [...all, step]);
    setAnnounce(t('funnel.editor.added', { n: steps.length + 1 }));
  };
  const useTemplate = (id: string) => {
    setTemplate(id);
    const config = toConfig(id);
    if (!config) return;
    setName(config.name);
    setSteps(toDraft(config));
    setAnnounce(t('funnel.editor.templateLoaded', { name: config.name }));
  };

  const errors = steps.map(stepError);
  const nameError = name.trim() ? undefined : t('funnel.editor.error.name');
  const submit = () => {
    setShowErrors(true);
    if (nameError || errors.some(Boolean)) {
      setAnnounce(t('funnel.editor.fixErrors'));
      return;
    }
    const parsed = FunnelConfig.safeParse(fromDraft(name, steps));
    if (!parsed.success) {
      setAnnounce(t('funnel.editor.fixErrors'));
      return;
    }
    save.mutate(parsed.data);
  };

  const templates = FUNNEL_TEMPLATE_DEFS.map((d) => ({ id: d.id, label: t(d.nameKey) }));
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-text-muted">{t('funnel.editor.intro')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('funnel.editor.name')}
          value={name}
          onChange={setName}
          maxLength={60}
          isRequired
          errorMessage={showErrors ? nameError : undefined}
        />
        <Select
          label={t('funnel.editor.startFrom')}
          options={templates}
          selectedKey={template || undefined}
          onSelectionChange={useTemplate}
        />
      </div>

      <ol ref={list} className="grid gap-3" aria-label={t('funnel.editor.steps')}>
        {steps.map((s, i) => {
          const err = showErrors ? errors[i] : undefined;
          const stepName = s.label.trim() || t('funnel.editor.stepN', { n: i + 1 });
          return (
            <li
              key={s.key}
              data-step={s.key}
              className="grid gap-3 rounded-md border border-border bg-surface-sunken p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('funnel.editor.stepN', { n: i + 1 })}</h3>
                <div className="flex gap-1">
                  <span data-action="up">
                    <IconButton
                      label={t('funnel.editor.moveUp', { label: stepName })}
                      isDisabled={i === 0}
                      onPress={() => move(i, -1)}
                      className="border border-border bg-surface"
                    >
                      <ArrowUp size={18} aria-hidden="true" />
                    </IconButton>
                  </span>
                  <span data-action="down">
                    <IconButton
                      label={t('funnel.editor.moveDown', { label: stepName })}
                      isDisabled={i === steps.length - 1}
                      onPress={() => move(i, 1)}
                      className="border border-border bg-surface"
                    >
                      <ArrowDown size={18} aria-hidden="true" />
                    </IconButton>
                  </span>
                  <span data-action="remove">
                    <IconButton
                      label={t('funnel.editor.remove', { label: stepName })}
                      isDisabled={steps.length <= MIN_STEPS}
                      onPress={() => remove(i)}
                      className="border border-border bg-surface text-bad"
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </IconButton>
                  </span>
                </div>
              </div>
              <TextField
                label={t('funnel.editor.stepName')}
                value={s.label}
                onChange={(v) => update(s.key, { label: v })}
                maxLength={60}
                isRequired
                errorMessage={err === 'label' ? t('funnel.editor.error.label') : undefined}
              />
              <Segmented
                label={t('funnel.editor.countsWhen')}
                value={s.kind}
                onChange={(v) => update(s.key, { kind: v as DraftStep['kind'] })}
                options={[
                  { id: 'path', label: t('funnel.editor.kind.path') },
                  { id: 'event', label: t('funnel.editor.kind.event') },
                ]}
              />
              <TextField
                label={s.kind === 'path' ? t('funnel.editor.path') : t('funnel.editor.event')}
                description={s.kind === 'path' ? t('funnel.editor.path.hint') : t('funnel.editor.event.hint')}
                placeholder={s.kind === 'path' ? '/checkout*' : 'purchase'}
                value={s.value}
                onChange={(v) => update(s.key, { value: v })}
                maxLength={s.kind === 'path' ? 200 : 64}
                lang="en"
                errorMessage={err && err !== 'label' ? t(`funnel.editor.error.${err}`) : undefined}
              />
              {s.extras.length ? (
                <div className="grid gap-1.5">
                  <p className="text-[0.8125rem] font-semibold text-text-muted">
                    {t('funnel.editor.alsoCounts')}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {s.extras.map((m, j) => (
                      <li
                        key={j}
                        className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface ps-2.5 text-[0.8125rem]"
                      >
                        <span lang="en">{extraLabel(m)}</span>
                        <IconButton
                          label={t('funnel.editor.removeRule', { rule: extraLabel(m) })}
                          onPress={() => update(s.key, { extras: s.extras.filter((_, k) => k !== j) })}
                        >
                          <X size={16} aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div>
        <Button variant="secondary" onPress={add} isDisabled={steps.length >= MAX_STEPS}>
          <Plus size={16} aria-hidden="true" />
          {t('funnel.editor.add')}
        </Button>
        {steps.length >= MAX_STEPS ? (
          <p className="mt-1.5 text-[0.8125rem] text-text-muted">
            {t('funnel.editor.max', { max: MAX_STEPS })}
          </p>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {save.isError ? <Banner tone="bad" title={t('funnel.editor.saveFailed')} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onPress={onDone} isDisabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isPending={save.isPending} pendingLabel={t('common.saving')}>
          {t('funnel.editor.save')}
        </Button>
      </div>
    </form>
  );
}

export default function FunnelEditorDialog({
  orgId,
  siteId,
  isOpen,
  onOpenChange,
}: {
  orgId: string;
  siteId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery(siteFunnelQuery(orgId, siteId));
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('funnel.editor.title')}
      closeLabel={t('common.close')}
    >
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <Banner tone="bad" title={t('errors.generic.body')} />
      ) : (
        <Editor
          orgId={orgId}
          siteId={siteId}
          initial={data?.funnel ?? null}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}
