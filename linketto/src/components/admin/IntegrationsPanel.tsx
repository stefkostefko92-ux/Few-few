import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Input, Label, Select } from '@/components/ui/Field';
import {
  clearSettingAction,
  registerWebhookAction,
  saveSettingsAction,
  sendTestEmailAction,
  testIntegrationAction,
} from '@/app/actions/integrations';
import { getSession, stepUpFresh } from '@/lib/auth';
import { canSeal } from '@/lib/secret-box';
import { openRevolutOrders, settingsOverview, type SettingStatus } from '@/lib/settings';
import { isSecretSetting, SETTING_GROUPS, type SettingGroup, type SettingKey } from '@/lib/settings-spec';
import { SITE_URL } from '@/lib/seo';

// „Плащания и имейл“ в админ панела: ключовете на Revolut и Brevo
// (actions/integrations.ts). Тайните никога не се връщат към браузъра —
// само откъде идват и последните 4 знака.

const FIELD_LABEL: Record<SettingKey, string> = {
  'revolut.secretKey': 'intFieldRevolutSecretKey',
  'revolut.webhookSecret': 'intFieldRevolutWebhookSecret',
  'revolut.env': 'intFieldRevolutEnv',
  'brevo.apiKey': 'intFieldBrevoApiKey',
  'brevo.sender': 'intFieldBrevoSender',
};

const SOURCE_TONE = { admin: 'success', env: 'neutral', none: 'warning', broken: 'danger' } as const;

export function settingFieldLabelKey(key: SettingKey): string {
  return FIELD_LABEL[key];
}

export async function IntegrationsPanel({
  locale,
  test,
  code,
  noDisputes,
  reused,
  webhookReset,
}: {
  locale: string;
  test?: string;
  code?: string;
  noDisputes?: boolean;
  reused?: boolean;
  webhookReset?: boolean;
}) {
  const t = await getTranslations('admin');
  const [overview, active, openOrders] = await Promise.all([settingsOverview(), getSession(), openRevolutOrders()]);
  const fresh = active ? stepUpFresh(active.session) : false;
  const sealOk = canSeal();
  const byKey = new Map(overview.map((status) => [status.key, status]));
  const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
  const httpCode = code && /^\d{3}$/.test(code) ? code : t('intNoConnection');

  const results: Record<string, { tone: 'success' | 'danger' | 'warning'; text: string }> = {
    'revolut-ok': { tone: 'success', text: t('intTestRevolutOk') },
    'revolut-fail': { tone: 'danger', text: t('intTestRevolutFail', { code: httpCode }) },
    'brevo-ok': { tone: 'success', text: t('intTestBrevoOk') },
    'brevo-fail': { tone: 'danger', text: t('intTestBrevoFail', { code: httpCode }) },
    'mail-ok': { tone: 'success', text: t('intTestMailOk') },
    'mail-fail': { tone: 'danger', text: t('intTestMailFail') },
    'mail-off': { tone: 'warning', text: t('intTestMailOff') },
    'webhook-ok': { tone: 'success', text: reused ? t('intWebhookReused') : t('intWebhookOk') },
    'webhook-exists': { tone: 'warning', text: t('intWebhookExists') },
    'webhook-failed': { tone: 'danger', text: t('intWebhookFail', { code: httpCode }) },
    'webhook-nokey': { tone: 'warning', text: t('intWebhookNoKey') },
  };
  const result = test ? results[test] : undefined;

  const statusLine = (status: SettingStatus) => (
    <div className="flex flex-wrap items-center gap-2 text-small">
      <Badge tone={SOURCE_TONE[status.source]} dot>
        {t(`intSource.${status.source}`)}
      </Badge>
      {status.display && <code className="break-all text-fg-2">{status.display}</code>}
      {status.key === 'revolut.env' && status.source === 'none' && (
        <span className="text-micro text-fg-muted">{t('intEnvDefault')}</span>
      )}
      {status.updatedAt && (
        <span className="text-micro text-fg-muted">
          {t('intUpdated', { date: stamp(status.updatedAt), who: status.updatedBy ?? '—' })}
        </span>
      )}
    </div>
  );

  const field = (key: SettingKey) => {
    const status = byKey.get(key)!;
    const id = `setting-${key.replace('.', '-')}`;
    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={id}>{t(FIELD_LABEL[key])}</Label>
        {statusLine(status)}
        {key === 'revolut.env' ? (
          <Select id={id} name={key} defaultValue="" disabled={!fresh}>
            <option value="">{t('intKeep')}</option>
            <option value="sandbox">{t('intEnvSandbox')}</option>
            <option value="production">{t('intEnvProduction')}</option>
          </Select>
        ) : (
          <Input
            id={id}
            name={key}
            type={isSecretSetting(key) ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('intKeep')}
            maxLength={500}
            disabled={!fresh || (isSecretSetting(key) && !sealOk)}
          />
        )}
      </div>
    );
  };

  const clearButtons = (group: SettingGroup) =>
    SETTING_GROUPS[group]
      .filter((key) => byKey.get(key)?.source === 'admin' || byKey.get(key)?.source === 'broken')
      .map((key) => (
        <form key={key} action={clearSettingAction}>
          <input type="hidden" name="uiLocale" value={locale} />
          <input type="hidden" name="key" value={key} />
          <Button type="submit" variant="ghost" size="sm" disabled={!fresh}>
            {t('intClear', { field: t(FIELD_LABEL[key]) })}
          </Button>
        </form>
      ));

  const groupCard = (group: SettingGroup, title: string, extra: React.ReactNode) => (
    <Card padding="sm" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-fg">{title}</h3>
        {group === 'revolut' && <Badge tone="accent">{t('intRevolutOnly')}</Badge>}
      </div>
      <form action={saveSettingsAction} className="space-y-4">
        <input type="hidden" name="uiLocale" value={locale} />
        <input type="hidden" name="group" value={group} />
        {SETTING_GROUPS[group].map(field)}
        {group === 'revolut' && openOrders > 0 && (
          <div className="space-y-2 rounded-control border border-warning/60 bg-warning-soft p-3 text-small text-warning-text">
            <p>{t('intOpenOrders', { count: openOrders })}</p>
            <label className="flex items-start gap-2 font-semibold">
              <input type="checkbox" name="confirmOpen" value={String(openOrders)} disabled={!fresh} className="mt-0.5" />
              {t('intOpenOrdersConfirm', { count: openOrders })}
            </label>
          </div>
        )}
        <Button type="submit" size="sm" disabled={!fresh}>
          {t('intSave')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <form action={testIntegrationAction}>
          <input type="hidden" name="uiLocale" value={locale} />
          <input type="hidden" name="provider" value={group} />
          <Button type="submit" variant="secondary" size="sm">
            {t('intTest')}
          </Button>
        </form>
        {extra}
        {clearButtons(group)}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {result && (
        <Callout tone={result.tone}>
          {result.text}
          {test === 'webhook-ok' && noDisputes ? ` ${t('intWebhookNoDisputes')}` : ''}
        </Callout>
      )}
      {webhookReset && <Callout tone="warning">{t('intWebhookReset')}</Callout>}
      {!sealOk && <Callout tone="warning">{t('intNoSealKey')}</Callout>}
      {!fresh && (
        <Callout tone="info">
          {t('intStepUpNeeded')}{' '}
          <a href={`/${locale}/admin/step-up`} className="focus-ring rounded-sm font-semibold text-accent-text underline">
            {t('intStepUpLink')}
          </a>
        </Callout>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groupCard(
          'revolut',
          t('intRevolutTitle'),
          <form action={registerWebhookAction}>
            <input type="hidden" name="uiLocale" value={locale} />
            <Button type="submit" variant="secondary" size="sm" disabled={!fresh || !sealOk} title={t('intWebhookHint', { url: `${SITE_URL}/api/revolut/webhook` })}>
              {t('intWebhook')}
            </Button>
          </form>,
        )}
        {groupCard(
          'brevo',
          t('intBrevoTitle'),
          <form action={sendTestEmailAction}>
            <input type="hidden" name="uiLocale" value={locale} />
            <Button type="submit" variant="secondary" size="sm">
              {t('intTestMail')}
            </Button>
          </form>,
        )}
      </div>
      <p className="text-micro text-fg-muted">{t('intWebhookHint', { url: `${SITE_URL}/api/revolut/webhook` })}</p>
    </div>
  );
}
