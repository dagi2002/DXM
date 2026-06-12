/**
 * Floating launcher for Ask Pulse.
 *
 * Sits bottom-right across key pages (Dashboard, Overview). One-shot toggle
 * for the slide-out panel. Keyboard shortcut: `?` opens.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AskPulsePanel } from './AskPulsePanel';

export const AskPulseBubble: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea/contenteditable.
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      const editable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if (editable) return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Ask Pulse"
          title="Ask Pulse (?)"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-primary-600 to-primary-500 px-4 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-primary-500/40 transition hover:scale-[1.03] hover:shadow-xl"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Ask Pulse</span>
        </button>
      )}
      <AskPulsePanel open={open} onClose={() => setOpen(false)} />
    </>
  );
};
