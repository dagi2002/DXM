import type { FormEvidence } from '@pulse/contracts';
import { fingerprintOf, normalizePath } from './paths';
import { describeVisits, perDay, sampleVisits, upsert, visitSeverity, windowEnd } from './shared';
import {
  FORM_ABANDON_CRITICAL_VISITS,
  FORM_ABANDON_GRACE_MINUTES,
  FORM_ABANDON_MIN_RATE,
  FORM_ABANDON_MIN_VISITS,
} from './thresholds';
import type { DetectorInput, Finding } from './types';

export const FORM_EVENT_TYPES = ['fs', 'fx', 'fe'] as const;

interface VisitForm {
  lastStart: Date | null;
  submitted: boolean;
  /** field → last message shown */
  errors: Map<string, string | null>;
}

export interface FormStats {
  path: string;
  form: string;
  fingerprint: string;
  /** Settled visits that started the form (submitted, or long enough ago to judge). */
  starts: number;
  submits: number;
  /** visit id → when it last started the form */
  abandoned: Map<string, Date>;
  errorFields: FormEvidence['errorFields'];
}

const formName = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null);

/**
 * Per (page template, form): which visits started it, submitted it, or gave up. A visit that is
 * still on the site only counts once FORM_ABANDON_GRACE_MINUTES have passed since its last start.
 */
export function formStats(input: DetectorInput): Map<string, FormStats> {
  const end = windowEnd(input).getTime();
  const graceMs = FORM_ABANDON_GRACE_MINUTES * 60_000;
  const forms = new Map<
    string,
    { path: string; form: string; fingerprint: string; visits: Map<string, VisitForm> }
  >();
  for (const e of input.events) {
    if (e.type !== 'fs' && e.type !== 'fx' && e.type !== 'fe') continue;
    const path = normalizePath(e.path);
    const form = formName(e.props.f);
    if (!path || !form) continue;
    const g = upsert(forms, `${path}\u0000${form}`, () => ({
      path,
      form,
      fingerprint: fingerprintOf('form_abandon', path, form),
      visits: new Map<string, VisitForm>(),
    }));
    const cutoff = input.ignoreBefore?.get(g.fingerprint);
    if (cutoff && e.at < cutoff) continue;
    const v = upsert(g.visits, e.visitId, () => ({ lastStart: null, submitted: false, errors: new Map() }));
    if (e.type === 'fs') {
      if (!v.lastStart || e.at > v.lastStart) v.lastStart = e.at;
    } else if (e.type === 'fx') {
      v.submitted = true;
    } else {
      const field = formName(e.props.n);
      if (field) v.errors.set(field, typeof e.props.m === 'string' ? e.props.m.slice(0, 120) : null);
    }
  }

  const out = new Map<string, FormStats>();
  for (const [key, g] of forms) {
    let starts = 0;
    let submits = 0;
    const abandoned = new Map<string, Date>();
    const fields = new Map<string, { visits: number; message: string | null }>();
    for (const [visitId, v] of g.visits) {
      if (v.submitted) {
        starts += 1;
        submits += 1;
        continue;
      }
      if (!v.lastStart) continue; // an error or submit without a start we saw: not judged
      const settled = Boolean(input.visits.get(visitId)?.endedAt) || end - v.lastStart.getTime() >= graceMs;
      if (!settled) continue;
      starts += 1;
      abandoned.set(visitId, v.lastStart);
      for (const [field, message] of v.errors) {
        const f = upsert(fields, field, () => ({ visits: 0, message }));
        f.visits += 1;
        if (message) f.message = message;
      }
    }
    out.set(key, {
      path: g.path,
      form: g.form,
      fingerprint: g.fingerprint,
      starts,
      submits,
      abandoned,
      errorFields: [...fields.entries()]
        .sort((a, b) => b[1].visits - a[1].visits || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([field, f]) => ({ field, visits: f.visits, message: f.message })),
    });
  }
  return out;
}

/** Forms that enough visitors start and then leave without submitting. */
export function detectFormAbandonment(input: DetectorInput): Finding<FormEvidence>[] {
  const findings: Finding<FormEvidence>[] = [];
  for (const s of formStats(input).values()) {
    const abandoned = s.abandoned.size;
    if (abandoned < FORM_ABANDON_MIN_VISITS) continue;
    const rate = s.starts ? abandoned / s.starts : 0;
    if (rate < FORM_ABANDON_MIN_RATE) continue;
    const times = [...s.abandoned.values()].map((d) => d.getTime());
    const facts = describeVisits(s.abandoned.keys(), s.path, input);
    findings.push({
      kind: 'form_abandon',
      fingerprint: s.fingerprint,
      severity: visitSeverity(s.path, abandoned, {
        minVisits: FORM_ABANDON_MIN_VISITS,
        criticalVisits: FORM_ABANDON_CRITICAL_VISITS,
      }),
      firstSeen: new Date(Math.min(...times)),
      lastSeen: new Date(Math.max(...times)),
      evidence: {
        type: 'form',
        path: s.path,
        form: s.form,
        windowHours: input.windowHours,
        visits: abandoned,
        starts: s.starts,
        submits: s.submits,
        abandonRate: Math.round(rate * 1000) / 1000,
        errorFields: s.errorFields,
        ...facts,
        sampleVisitIds: sampleVisits(s.abandoned),
      },
      impact: {
        visitsPerDay: perDay(abandoned, input.windowHours),
        leftPerDay: perDay(facts.leftOnPage, input.windowHours),
      },
    });
  }
  return findings;
}
