// Its own module so screens that don't use it don't download it (first-load budget, 03 §8).
import { ChevronDown } from 'lucide-react';
import {
  Button as RACButton,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as RACSelect,
  SelectValue,
  type Key,
} from 'react-aria-components';
import { cx, focusRing } from './components';

export interface SelectOption {
  id: string;
  label: string;
}

export function Select({
  label,
  options,
  selectedKey,
  onSelectionChange,
  name,
  className,
}: {
  label: string;
  options: SelectOption[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  name?: string;
  className?: string;
}) {
  return (
    <RACSelect
      name={name}
      selectedKey={selectedKey}
      onSelectionChange={(k: Key | null) => k !== null && onSelectionChange?.(String(k))}
      className={cx('grid gap-1.5', className)}
    >
      <Label className="text-sm font-semibold text-text">{label}</Label>
      <RACButton
        className={cx(
          'flex min-h-11 w-full items-center justify-between rounded-md border border-border-strong bg-surface px-3 text-left text-[0.9375rem] text-text',
          focusRing,
        )}
      >
        <SelectValue />
        <ChevronDown size={16} aria-hidden="true" className="text-text-muted" />
      </RACButton>
      <Popover className="min-w-(--trigger-width) rounded-md border border-border bg-surface p-1 shadow-lg">
        <ListBox className="max-h-72 overflow-auto outline-none">
          {options.map((o) => (
            <ListBoxItem
              key={o.id}
              id={o.id}
              textValue={o.label}
              className="cursor-default rounded-sm px-3 py-2 text-sm text-text outline-none data-[focused]:bg-surface-sunken data-[selected]:font-semibold data-[selected]:text-primary"
            >
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </RACSelect>
  );
}
