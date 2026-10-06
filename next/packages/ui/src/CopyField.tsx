import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './components';

/** Read-only code with a copy button. Always left-to-right Latin, even inside Amharic UI. */
export function CopyField({
  value,
  label,
  copyLabel,
  copiedLabel,
}: {
  value: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (http, old WebView): select the text so a long-press/⌘C still works.
      const el = document.getElementById(`copy-${label}`);
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };
  return (
    <div className="overflow-hidden rounded-md border border-border-strong bg-surface-sunken">
      <pre
        id={`copy-${label}`}
        aria-label={label}
        lang="en"
        dir="ltr"
        tabIndex={0}
        className="overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed whitespace-pre text-text outline-none focus-visible:outline-3 focus-visible:outline-primary"
      >
        {value}
      </pre>
      <div className="flex items-center justify-end gap-3 border-t border-border bg-surface px-3 py-2">
        <span role="status" className="text-sm font-medium text-good">
          {copied ? copiedLabel : ''}
        </span>
        <Button size="sm" variant="secondary" onPress={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copyLabel}
        </Button>
      </div>
    </div>
  );
}
