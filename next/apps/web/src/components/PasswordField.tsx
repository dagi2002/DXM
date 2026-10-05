import { IconButton, TextField } from '@pulse/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function PasswordField({
  value,
  onChange,
  autoComplete,
  description,
  errorMessage,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  description?: string;
  errorMessage?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label ?? t('auth.password')}
      name="password"
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      description={description}
      errorMessage={errorMessage}
      isRequired
      endAdornment={
        <IconButton
          label={visible ? t('auth.password.hide') : t('auth.password.show')}
          onPress={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </IconButton>
      }
    />
  );
}
