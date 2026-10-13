import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestI18n, withI18n } from '../test/i18n';
import { PasswordField } from './PasswordField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

let en: Awaited<ReturnType<typeof createTestI18n>>;
let am: Awaited<ReturnType<typeof createTestI18n>>;
beforeAll(async () => {
  en = await createTestI18n('en');
  am = await createTestI18n('am');
});

function NewPassword({ personal }: { personal?: string[] }) {
  const [pw, setPw] = useState('');
  return (
    <>
      <PasswordField value={pw} onChange={setPw} autoComplete="new-password" />
      <PasswordStrengthMeter password={pw} personal={personal} />
    </>
  );
}

const type = (value: string) => fireEvent.change(screen.getByLabelText('Password'), { target: { value } });

describe('PasswordStrengthMeter', () => {
  it('renders nothing until the user types', () => {
    render(<PasswordStrengthMeter password="" />, { wrapper: withI18n(en) });
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('is an accessible meter whose value text is the strength word, updating as you type', () => {
    render(<NewPassword personal={['Abebe Kebede', 'abebe@example.et']} />, { wrapper: withI18n(en) });

    type('short');
    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter).toHaveAttribute('aria-valuetext', 'Too short');
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();

    type('1234567890');
    expect(meter).toHaveAttribute('aria-valuetext', 'Weak');

    type('abebe2026!!');
    expect(meter).toHaveAttribute('aria-valuetext', 'Weak'); // built from the user's own name

    type('tiger-lamp-9');
    expect(meter).toHaveAttribute('aria-valuetext', 'Good');

    type('Correct-Horse-Battery-Staple-9');
    expect(meter).toHaveAttribute('aria-valuenow', '4');
    expect(meter).toHaveAttribute('aria-valuetext', 'Strong');
    expect(screen.getByText('Strong password.')).toBeInTheDocument();
  });

  it('never conveys strength by color alone: the word is visible text', () => {
    render(<PasswordStrengthMeter password="tiger-lamp-9" />, { wrapper: withI18n(en) });
    expect(screen.getByText('Good')).toBeVisible();
  });

  it('speaks Amharic', () => {
    render(<PasswordStrengthMeter password="short" />, { wrapper: withI18n(am) });
    expect(screen.getByRole('meter', { name: 'የይለፍ ቃል ጥንካሬ' })).toHaveAttribute('aria-valuetext', 'በጣም አጭር');
  });
});
