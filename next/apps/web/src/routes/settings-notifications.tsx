import { canManage } from '@pulse/contracts/constants';
import type { NotificationSettings, TelegramStatus } from '@pulse/contracts';
import { Checkbox } from '@pulse/ui/checkbox';
import { Banner, Button, Segmented, Select, Skeleton, buttonClass } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/pulse';
import { useFormatDate, useMe } from '../lib/queries';
import {
  PushPermissionError,
  notificationsQuery,
  pushDeviceQuery,
  pushSupport,
  useNotificationActions,
} from '../lib/notifications';
import { telegramQuery, useTelegramActions } from '../lib/telegram';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function LinkedSettings({ status, canEdit }: { status: TelegramStatus; canEdit: boolean }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const link = status.link!;
  const actions = useTelegramActions(orgId);
  const [locale, setLocale] = useState<'en' | 'am'>(link.locale);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.save.mutate({ locale });
  };
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

/** The org's quiet hours: one rule for Telegram and web push. Owners and admins change it. */
function QuietHoursPanel({ settings, canEdit }: { settings: NotificationSettings; canEdit: boolean }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const actions = useNotificationActions(orgId);
  const q = settings.quietHours;
  const [start, setStart] = useState<string>(q.quietStart === null ? 'off' : String(q.quietStart));
  const [end, setEnd] = useState<string>(q.quietEnd === null ? '7' : String(q.quietEnd));
  const quietOn = start !== 'off';
  const hourOptions = HOURS.map((h) => ({ id: String(h), label: hourLabel(h) }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    actions.quietHours.mutate({
      quietStart: quietOn ? Number(start) : null,
      quietEnd: quietOn ? Number(end === start ? (Number(start) + 1) % 24 : end) : null,
    });
  };
  const summary =
    q.quietStart === null || q.quietEnd === null
      ? t('settings.quiet.always')
      : t('settings.quiet.between', { from: hourLabel(q.quietStart), to: hourLabel(q.quietEnd) });
  return (
    <Panel id="settings-quiet" title={t('settings.telegram.quiet')} note={t('settings.quiet.help')}>
      {actions.quietHours.isSuccess ? <Banner tone="good" title={t('settings.telegram.saved')} /> : null}
      {actions.quietHours.isError ? <Banner tone="bad" title={t('settings.notify.error')} /> : null}
      {canEdit ? (
        <form onSubmit={submit} className="grid max-w-md gap-4">
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
          <Button type="submit" className="w-fit" isDisabled={actions.quietHours.isPending}>
            {t('settings.telegram.save')}
          </Button>
        </form>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm">{summary}</p>
          <p className="text-[0.8125rem] text-text-muted">{t('settings.quiet.managersOnly')}</p>
        </div>
      )}
    </Panel>
  );
}

/**
 * Web push on this browser. The browser's permission prompt only appears after the person presses
 * the button here — never on page load.
 */
function PushPanel({ settings }: { settings: NotificationSettings }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const actions = useNotificationActions(orgId);
  const support = pushSupport();
  const { data: onHere, isLoading } = useQuery({
    ...pushDeviceQuery(orgId),
    enabled: settings.push.configured,
  });
  const enableError = actions.enablePush.error;
  const error =
    enableError instanceof PushPermissionError
      ? t('settings.push.blocked')
      : (enableError ?? actions.disablePush.error ?? actions.testPush.error)
        ? t('settings.notify.error')
        : null;
  let body;
  if (!settings.push.configured) {
    body = <p className="text-sm text-text-muted">{t('settings.push.notConfigured')}</p>;
  } else if (support === 'unsupported') {
    body = <p className="text-sm text-text-muted">{t('settings.push.unsupported')}</p>;
  } else if (support === 'denied') {
    body = <p className="text-sm text-text-muted">{t('settings.push.blocked')}</p>;
  } else if (isLoading) {
    body = <Skeleton className="h-11 w-56" />;
  } else if (onHere) {
    body = (
      <div className="grid gap-3">
        <p className="text-sm">{t('settings.push.on')}</p>
        {actions.testPush.isSuccess ? <Banner tone="good" title={t('settings.push.testSent')} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onPress={() => actions.testPush.mutate()}
            isDisabled={actions.testPush.isPending}
          >
            {t('settings.push.test')}
          </Button>
          <Button
            variant="ghost"
            onPress={() => actions.disablePush.mutate()}
            isDisabled={actions.disablePush.isPending}
          >
            {t('settings.push.turnOff')}
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-3">
        <p className="text-sm text-text-muted">
          {settings.push.devices
            ? t('settings.push.otherDevices', { count: settings.push.devices })
            : t('settings.push.off')}
        </p>
        <Button
          className="w-fit"
          onPress={() => actions.enablePush.mutate(settings.push.publicKey!)}
          isDisabled={actions.enablePush.isPending}
        >
          <BellRing size={16} aria-hidden="true" />
          {t('settings.push.turnOn')}
        </Button>
      </div>
    );
  }
  return (
    <Panel id="settings-push" title={t('settings.push.title')} note={t('settings.push.subtitle')}>
      {error ? <Banner tone="bad" title={error} /> : null}
      {body}
    </Panel>
  );
}

/** This member's Monday digest email for the active org. */
function DigestPanel({ settings }: { settings: NotificationSettings }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const actions = useNotificationActions(orgId);
  return (
    <Panel id="settings-digest" title={t('settings.digest.title')} note={t('settings.digest.subtitle')}>
      {actions.digest.isError ? <Banner tone="bad" title={t('settings.notify.error')} /> : null}
      <Checkbox
        isSelected={settings.weeklyDigest}
        onChange={(weeklyDigest) => actions.digest.mutate({ weeklyDigest })}
      >
        {t('settings.digest.toggle')}
      </Checkbox>
    </Panel>
  );
}

/** Settings → Notifications: quiet hours, web push, the Monday digest, and Telegram. */
export function NotificationsSection() {
  const { orgId, role } = useMe();
  const { data: settings, isLoading } = useQuery(notificationsQuery(orgId));
  return (
    <div className="grid gap-5">
      {isLoading || !settings ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <PushPanel settings={settings} />
          <DigestPanel settings={settings} />
          <QuietHoursPanel
            key={`${settings.quietHours.quietStart}-${settings.quietHours.quietEnd}`}
            settings={settings}
            canEdit={canManage(role)}
          />
        </>
      )}
      <TelegramPanel />
    </div>
  );
}

function TelegramPanel() {
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
