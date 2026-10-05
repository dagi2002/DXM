import { clsx } from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Info, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button as RACButton,
  Dialog,
  FieldError,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal as RACModal,
  ModalOverlay,
  Popover,
  Radio,
  RadioGroup,
  Select as RACSelect,
  SelectValue,
  Text,
  TextField as RACTextField,
  type ButtonProps as RACButtonProps,
  type Key,
} from 'react-aria-components';

export const cx = clsx;

const focusRing =
  'outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-primary';

/* ── Button ──────────────────────────────────────────────────────────────── */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary data-[hovered]:bg-primary-hover',
  secondary: 'bg-surface text-text border border-border-strong data-[hovered]:bg-surface-sunken',
  ghost: 'bg-transparent text-text data-[hovered]:bg-surface-sunken',
  danger: 'bg-bad text-on-primary data-[hovered]:opacity-90',
  'danger-ghost': 'bg-transparent text-bad data-[hovered]:bg-bad-bg',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors select-none',
    'data-[pressed]:translate-y-px data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
    size === 'md' ? 'min-h-11 px-4 text-sm' : 'min-h-9 px-3 text-[0.8125rem]',
    buttonVariants[variant],
    focusRing,
    className,
  );
}

export interface ButtonProps extends Omit<RACButtonProps, 'className' | 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  /** Accessible text announced while pending, e.g. "Saving…". */
  pendingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  isPending,
  pendingLabel,
  ...props
}: ButtonProps) {
  return (
    <RACButton {...props} isPending={isPending} className={buttonClass(variant, size, className)}>
      {isPending ? (
        <>
          <Spinner size={16} label={pendingLabel ?? ''} />
          <span aria-hidden="true">{pendingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </RACButton>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: Omit<ButtonProps, 'children' | 'aria-label'> & { label: string; children: ReactNode }) {
  return (
    <RACButton
      {...props}
      aria-label={label}
      className={cx(
        'inline-grid size-11 place-items-center rounded-md text-text-muted transition-colors data-[hovered]:bg-surface-sunken data-[hovered]:text-text',
        focusRing,
        className,
      )}
    >
      {children}
    </RACButton>
  );
}

/* ── Spinner / Skeleton ──────────────────────────────────────────────────── */
export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('rounded-md bg-surface-sunken motion-safe:animate-pulse', className)}
    />
  );
}

/* ── Fields ──────────────────────────────────────────────────────────────── */
export interface TextFieldProps {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'url' | 'search';
  autoComplete?: string;
  placeholder?: string;
  description?: ReactNode;
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  autoFocus?: boolean;
  inputMode?: 'text' | 'email' | 'url';
  className?: string;
  endAdornment?: ReactNode;
  lang?: string;
}

export function TextField({
  label,
  description,
  errorMessage,
  className,
  placeholder,
  endAdornment,
  inputMode,
  lang,
  ...props
}: TextFieldProps) {
  return (
    <RACTextField
      {...props}
      isInvalid={!!errorMessage}
      validationBehavior="aria"
      className={cx('grid gap-1.5', className)}
    >
      <Label className="text-sm font-semibold text-text">{label}</Label>
      <div className="relative">
        <Input
          placeholder={placeholder}
          inputMode={inputMode}
          lang={lang}
          className={cx(
            'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-[0.9375rem] text-text placeholder:text-text-faint',
            'outline-none data-[focused]:border-primary data-[focused]:ring-3 data-[focused]:ring-primary-soft',
            'data-[invalid]:border-bad',
            endAdornment ? 'pr-12' : '',
          )}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center">{endAdornment}</div>
        ) : null}
      </div>
      {description && !errorMessage ? (
        <Text slot="description" className="text-[0.8125rem] text-text-muted">
          {description}
        </Text>
      ) : null}
      <FieldError className="text-[0.8125rem] font-medium text-bad">{errorMessage}</FieldError>
    </RACTextField>
  );
}

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

/** Accessible segmented control (a styled radio group). */
export function Segmented({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string; lang?: string }[];
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={onChange}
      orientation="horizontal"
      className={cx('grid gap-1.5', className)}
    >
      <Label className={hideLabel ? 'sr-only' : 'text-sm font-semibold text-text'}>{label}</Label>
      <div className="inline-flex w-fit rounded-md border border-border bg-surface-sunken p-[3px]">
        {options.map((o) => (
          <Radio
            key={o.id}
            value={o.id}
            lang={o.lang}
            className={cx(
              'inline-flex min-h-9 cursor-default items-center rounded-[7px] px-3.5 text-[0.8125rem] font-semibold text-text-muted transition-colors',
              'data-[selected]:bg-surface data-[selected]:text-text data-[selected]:shadow-sm',
              focusRing,
            )}
          >
            {o.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

/* ── Status ──────────────────────────────────────────────────────────────── */
export type Tone = 'good' | 'warn' | 'bad' | 'ai' | 'info';

const toneClass: Record<Tone, string> = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  ai: 'bg-ai-bg text-ai',
  info: 'bg-info-bg text-info',
};

const toneIcon: Record<Tone, typeof Info> = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: AlertOctagon,
  ai: Sparkles,
  info: Info,
};

/** Status is never color alone: icon + word + color. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={cx(
        'inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold',
        toneClass[tone],
        className,
      )}
    >
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const Icon = toneIcon[tone];
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-md px-4 py-3 text-sm', toneClass[tone])}
    >
      <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-text">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-text-muted' : ''}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton label={dismissLabel} onPress={onDismiss} className="-my-2 -mr-2">
          <X size={16} aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────────── */
export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <As className={cx('rounded-lg border border-border bg-surface p-5', className)}>{children}</As>;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
          {icon}
        </div>
      ) : null}
      <h2 className="font-display text-lg font-bold text-text">{title}</h2>
      {body ? <p className="mt-1.5 max-w-md text-[0.9375rem] text-text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  summary,
  actions,
}: {
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight text-text">
          {title}
        </h1>
        {summary ? <p className="mt-1 text-[0.9375rem] text-text-muted">{summary}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/* ── Dialog ──────────────────────────────────────────────────────────────── */
export function Modal({
  isOpen,
  onOpenChange,
  title,
  children,
  closeLabel = 'Close',
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  closeLabel?: string;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <RACModal className="w-full max-w-lg rounded-t-xl border border-border bg-surface shadow-xl sm:rounded-xl">
        <Dialog className="relative max-h-[90dvh] overflow-y-auto p-6 outline-none">
          <Heading slot="title" className="pr-10 font-display text-xl font-bold text-text">
            {title}
          </Heading>
          <IconButton label={closeLabel} slot="close" className="absolute top-3 right-3">
            <X size={18} aria-hidden="true" />
          </IconButton>
          <div className="mt-4">{children}</div>
        </Dialog>
      </RACModal>
    </ModalOverlay>
  );
}

/* ── Brand ───────────────────────────────────────────────────────────────── */
export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 font-display text-[0.9375rem] font-bold tracking-tight text-text',
        className,
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-primary"
      >
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
      {wordmark ? <span>DXM Pulse</span> : <span className="sr-only">DXM Pulse</span>}
    </span>
  );
}
