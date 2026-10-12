import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Checkbox as RACCheckbox } from 'react-aria-components';
import { cx } from './components';

export function Checkbox({
  children,
  isSelected,
  onChange,
  className,
}: {
  children: ReactNode;
  isSelected?: boolean;
  onChange?: (selected: boolean) => void;
  className?: string;
}) {
  return (
    <RACCheckbox
      isSelected={isSelected}
      onChange={onChange}
      className={cx(
        'group inline-flex min-h-11 cursor-default items-center gap-2.5 text-sm text-text',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'grid size-5 shrink-0 place-items-center rounded-[5px] border border-border-strong bg-surface text-on-primary',
          'group-data-[selected]:border-primary group-data-[selected]:bg-primary',
          'group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-primary',
        )}
      >
        <Check size={14} strokeWidth={3} className="hidden group-data-[selected]:block" />
      </span>
      {children}
    </RACCheckbox>
  );
}
