import { canManage } from '@pulse/contracts/constants';
import type { TelegramStatus } from '@pulse/contracts';
import { Banner, Button, Segmented, Select, Skeleton, buttonClass } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/pulse';
import { useFormatDate, useMe } from '../lib/queries';
import { telegramQuery, useTelegramActions } from '../lib/telegram';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function LinkedSettings({ status, canEdit }: { status: TelegramStatus; canEdit: boolean }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const link = status.link!;
  const actions = useTelegramActions(orgId);
  const [start, setStart] = useState<string>(link.quietStart === null ? 'off' : String(link.quietStart));
  const [end, setEnd] = useState<string>(link.quietEnd === null ? '7' : String(link.quietEnd));
  const [locale, setLocale] = useState<'en' | 'am'>(link.locale);
  const quietOn = start !== 'off';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.save.mutate({
      quietStart: quietOn ? Number(start) : null,
      quietEnd: quietOn ? Number(end) : null,
      locale,
    });
  };
  const hourOptions = HOURS.map((h) => ({ id: String(h), label: hourLabel(h) }));
  const error = actions.save.error ?? actions.test.error ?? actions.unlink.error;
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        {t('settings.telegram.linked', { chat: link.chatTitle ?? t('settings.telegram.chatFallback') })}
      </p>
      {actions.save.isSuccess ? <Banner tone="good" title={t('settings.telegram.saved')} /> : null}
      {actions.test.isSuccess ? <Banner tone="good" title={t('settings.telegram.testSent')} /> : null}
      {error ? <Banner tone="bad" title={t('settings.telegram.error')} /> : null}
      {canEdit ? (
        <form onSubmit={submit} className="grid max-w-md gap-5">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">{t('settings.telegram.quiet')}</legend>
            <p className="text-[0.8125rem] text-text-muted">{t('settings.telegram.quietHelp')}</p>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('settings.telegram.quietFrom')}
                selectedKey={start}
                onSelectionChange={setStart}
                options={[{ id: 'off', label: t('settings.telegram.quietOff') }, ...hourOptions]}
              />
              {quietOn ? (
                <Select
                  label={t('settings.telegram.quietTo')}
                  selectedKey={end}
                  onSelectionChange={setEnd}
                  options={hourOptions.filter((o) => o.id !== start)}
                />
              ) : null}
            </div>
          </fieldset>
          <Segmented
            label={t('settings.telegram.language')}
            value={locale}
            onChange={(v) => setLocale(v as 'en' | 'am')}
            options={[
              { id: 'en', label: 'English', lang: 'en' },
              { id: 'am', label: 'አማርኛ', lang: 'am' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" isDisabled={actions.save.isPending}>
              {t('settings.telegram.save')}
            </Button>
            <Button
              variant="secondary"
              onPress={() => actions.test.mutate()}
              isDisabled={actions.test.isPending}
            >
              <Send size={16} aria-hidden="true" />
              {t('settings.telegram.test')}
            </Button>
            <Button
              variant="ghost"
              onPress={() => actions.unlink.mutate()}
              isDisabled={actions.unlink.isPending}
            >
              {t('settings.telegram.unlink')}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-[0.8125rem] text-text-muted">{t('settings.telegram.managersOnly')}</p>
      )}
    </div>
  );
}

/** Settings → Notifications: link a Telegram chat, quiet hours, message language. */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { orgId, role } = useMe();
  const formatDate = useFormatDate();
  const canEdit = canManage(role);
  const actions = useTelegramActions(orgId);
  const code = actions.linkCode.data;
  const { data: status, isLoading } = useQuery(telegramQuery(orgId, Boolean(code)));
  const linked = Boolean(status?.link);

  return (
    <Panel
      id="settings-notifications"
      title={t('settings.telegram.title')}
      note={t('settings.telegram.subtitle')}
    >
      {isLoading || !status ? (
        <Skeleton className="h-24" />
      ) : !status.configured ? (
        <p className="text-sm text-text-muted">{t('settings.telegram.notConfigured')}</p>
      ) : linked ? (
        <LinkedSettings key={status.link!.linkedAt} status={status} canEdit={canEdit} />
      ) : (
        <div className="grid max-w-md gap-4">
          <p className="text-sm text-text-muted">{t('settings.telegram.notLinked')}</p>
          {actions.linkCode.isError ? <Banner tone="bad" title={t('settings.telegram.error')} /> : null}
          {!canEdit ? (
            <p className="text-[0.8125rem] text-text-muted">{t('settings.telegram.managersOnly')}</p>
          ) : code ? (
            <div className="grid gap-3">
              <a
                href={code.url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('primary', 'md', 'w-fit')}
              >
                <Send size={16} aria-hidden="true" />
                {t('settings.telegram.openLink')}
              </a>
              <p className="text-[0.8125rem] leading-relaxed text-text-muted">
                {t('settings.telegram.linkHelp', { time: formatDate(code.expiresAt, true) })}
              </p>
              <p role="status" className="text-[0.8125rem] text-text-muted">
                {t('settings.telegram.waiting')}
              </p>
            </div>
          ) : (
            <Button
              className="w-fit"
              onPress={() => actions.linkCode.mutate()}
              isDisabled={actions.linkCode.isPending}
            >
              <Send size={16} aria-hidden="true" />
              {t('settings.telegram.connect')}
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
