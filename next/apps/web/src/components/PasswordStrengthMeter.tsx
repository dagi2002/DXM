import { cx } from '@pulse/ui';
import { useMemo } from 'react';
import { Label, Meter } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { passwordStrength, type StrengthLevel } from '../lib/password-strength';

const barTone: Record<StrengthLevel, string> = {
  tooShort: 'bg-bad',
  weak: 'bg-bad',
  fair: 'bg-warn',
  good: 'bg-good',
  strong: 'bg-good',
};
const textTone: Record<StrengthLevel, string> = {
  tooShort: 'text-text-muted',
  weak: 'text-bad',
  fair: 'text-warn',
  good: 'text-good',
  strong: 'text-good',
};

/**
 * Four-segment strength meter under a new-password field. Guidance only: the server enforces
 * the real rule. Exposed as an ARIA meter whose value text is the word ("Fair"), so the state is
 * never color alone; the hint below says what would make it stronger.
 */
export function PasswordStrengthMeter({
  password,
  personal = [],
}: {
  password: string;
  personal?: string[];
}) {
  const { t } = useTranslation();
  const { level, score } = useMemo(() => passwordStrength(password, personal), [password, personal]);
  if (!password) return null;
  const word = t(`auth.password.strength.${level}`);
  return (
    <Meter
      value={score}
      minValue={0}
      maxValue={4}
      valueLabel={word}
      className="-mt-2 grid gap-1.5"
      data-level={level}
    >
      <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
        <Label className="text-text-muted">{t('auth.password.strength.label')}</Label>
        <span className={cx('font-semibold', textTone[level])}>{word}</span>
      </div>
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx(
              'h-1.5 rounded-full motion-safe:transition-colors',
              i <= Math.max(score, level === 'tooShort' ? 0 : 1) ? barTone[level] : 'bg-surface-sunken',
            )}
          />
        ))}
      </div>
      <p className="text-[0.8125rem] text-text-muted">{t(`auth.password.strength.tip.${level}`)}</p>
    </Meter>
  );
}
