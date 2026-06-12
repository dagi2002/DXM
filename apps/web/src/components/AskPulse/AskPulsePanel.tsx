/**
 * Ask Pulse slide-out chat panel.
 *
 * Anchored bottom-right (matches the bubble launcher). Keeps history for the
 * active workspace in localStorage via `useAskPulseHistory`.
 *
 * Language: reads `dxm_lang` from localStorage (set by the i18n setup) so
 * Amharic users get Amharic answers. Server receives `lang` on every POST.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles, Trash2, X, AlertCircle, Bot, User, Loader2 } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useAuth } from '../../context/useAuth';
import type { AskPulseApiResponse, AskPulseCitation } from './types';
import { useAskPulseHistory } from './useAskPulseHistory';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  'Which site has the worst LCP this week?',
  'What rage clicks have fired in the last 24 hours?',
  'Summarize conversion performance across all sites.',
  'Show sessions where visitors bounced from the homepage.',
];

const readLang = (): 'en' | 'am' => {
  try {
    const stored = window.localStorage.getItem('dxm_lang');
    return stored === 'am' ? 'am' : 'en';
  } catch {
    return 'en';
  }
};

const CitationChip: React.FC<{ citation: AskPulseCitation }> = ({ citation }) => {
  const href =
    citation.kind === 'site'
      ? `/clients/${citation.id}`
      : citation.kind === 'alert'
      ? `/alerts`
      : citation.kind === 'session'
      ? `/sessions?sessionId=${citation.id}`
      : '/analytics';

  return (
    <Link
      to={href}
      className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-semibold text-surface-700 hover:border-primary-300 hover:text-primary-700"
      title={citation.label}
    >
      <span className="uppercase tracking-[0.14em] text-surface-400">{citation.kind}</span>
      <span className="truncate">{citation.label}</span>
    </Link>
  );
};

export const AskPulsePanel: React.FC<Props> = ({ open, onClose }) => {
  const { workspace } = useAuth();
  const { turns, appendTurn, clear } = useAskPulseHistory(workspace?.id ?? null);
  const [question, setQuestion] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // focus on open, scroll transcript to latest
      setTimeout(() => inputRef.current?.focus(), 50);
      transcriptRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const resp = await fetchJson<AskPulseApiResponse>('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, lang: readLang() }),
      });
      appendTurn({
        id: `turn-${Date.now()}`,
        question: resp.question,
        answer: resp.answer,
        citations: resp.citations ?? [],
        mode: resp.mode,
        createdAt: Date.now(),
      });
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask Pulse failed');
    } finally {
      setIsPending(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Scrim — dims the page and closes on tap. */}
      <button
        type="button"
        aria-label="Close Ask Pulse"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-surface-900/20 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-label="Ask Pulse"
        className="fixed bottom-0 right-0 z-50 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-surface-200 bg-white shadow-2xl sm:bottom-6 sm:right-6 sm:h-[640px] sm:max-h-[90vh] sm:rounded-[28px] sm:border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-200 bg-gradient-to-br from-primary-50 to-white px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-surface-900">Ask Pulse</h3>
              <p className="text-[11px] text-surface-500">
                Your agency analytics in plain language
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-rose-600"
                title="Clear history"
                aria-label="Clear history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-surface-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-surface-50/40"
        >
          {turns.length === 0 && !isPending ? (
            <div className="space-y-3">
              <p className="text-sm text-surface-600">
                Ask anything about your portfolio — sites, alerts, sessions, Web Vitals. Pulse calls
                the right tools under the hood so the answer is always backed by your live data.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-700 transition hover:border-primary-300 hover:text-primary-700"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) => (
              <div key={turn.id} className="space-y-2">
                {/* User bubble */}
                <div className="flex items-start gap-2 justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-600 px-3 py-2 text-sm text-white shadow-sm">
                    {turn.question}
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <User className="h-3.5 w-3.5" />
                  </div>
                </div>
                {/* Assistant bubble */}
                <div className="flex items-start gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-500 text-white">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-surface-800 shadow-sm ring-1 ring-surface-200">
                    <p className="whitespace-pre-line leading-relaxed">{turn.answer}</p>
                    {turn.mode === 'fallback' && (
                      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                        <AlertCircle className="h-3 w-3" />
                        Offline mode
                      </p>
                    )}
                    {turn.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {turn.citations.map((citation) => (
                          <CitationChip key={`${citation.kind}-${citation.id}`} citation={citation} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isPending && (
            <div className="flex items-start gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-500 text-white">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-surface-600 shadow-sm ring-1 ring-surface-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" />
                Looking across your portfolio…
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="border-t border-surface-200 bg-white px-4 py-3"
        >
          {error && (
            <div className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Pulse anything about your sites…"
              disabled={isPending}
              className="flex-1 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="submit"
              disabled={isPending || !question.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-surface-300"
              aria-label="Send"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-surface-400">
            Pulse uses Claude Haiku and reads only your own workspace data. Answers in Amharic when your language is set to AM.
          </p>
        </form>
      </aside>
    </>
  );
};
