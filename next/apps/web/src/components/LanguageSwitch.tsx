import type { Locale } from '@pulse/i18n';
import { Segmented } from '@pulse/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { meQuery } from '../lib/queries';

/** EN / አማ switch, available on every screen (public and signed-in, desktop and mobile). */
export function LanguageSwitch({ persist = false, className }: { persist?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  // Reflect the tap immediately; the text switches once that language's file has arrived.
  const [selected, setSelected] = useState(i18n.language);
  useEffect(() => {
    const sync = (lng: string) => setSelected(lng);
    i18n.on('languageChanged', sync);
    return () => i18n.off('languageChanged', sync);
  }, [i18n]);
  const change = async (value: string) => {
    const locale = value as Locale;
    setSelected(locale);
    await i18n.changeLanguage(locale);
    if (persist) {
      const me = await api('/me/preferences', { method: 'PATCH', body: { locale } }).catch(() => null);
      if (me) qc.setQueryData(meQuery.queryKey, me as never);
    }
  };
  return (
    <Segmented
      label={t('common.language')}
      hideLabel
      value={selected}
      onChange={change}
      className={className}
      options={[
        { id: 'en', label: 'EN', lang: 'en' },
        { id: 'am', label: 'አማ', lang: 'am' },
      ]}
    />
  );
}
