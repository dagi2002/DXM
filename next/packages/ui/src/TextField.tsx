// Its own module so screens that don't use it don't download it (first-load budget, 03 §8).
import type { ReactNode } from 'react';
import { FieldError, Input, Label, Text, TextField as RACTextField } from 'react-aria-components';
import { cx } from './components';

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
  inputMode?: 'text' | 'email' | 'url' | 'numeric';
  maxLength?: number;
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
