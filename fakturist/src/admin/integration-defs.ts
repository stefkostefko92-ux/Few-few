/**
 * Външните услуги, които мастър акаунтът настройва от панела (Настройки): пощата (Brevo SMTP), Revolut
 * Merchant API и точката за достъп до Peppol (eConnect). ЕДИНСТВЕНИЯТ списък — панелът рисува формите от тук. Тайните се пазят шифровани в
 * Integration.secretsEnc и никога не се връщат към изгледа — само последните 4 знака. Панелът има
 * предимство пред `.env`; без панел важи `.env` (резерва при първото пускане).
 */
export type IntegrationCode = 'smtp' | 'revolut' | 'peppol';

interface Text {
  bg: string;
  en: string;
}

export interface IntegrationField {
  name: string;
  kind: 'text' | 'number' | 'checkbox' | 'select' | 'secret';
  secret: boolean;
  label: Text;
  help?: Text;
  placeholder?: string;
  options?: readonly string[];
}

export interface IntegrationDefinition {
  label: Text;
  help: Text;
  fields: readonly IntegrationField[];
  defaults: Record<string, string | number | boolean>;
}

export const DEFAULT_MAIL_FROM = 'Фактурист <no-reply@fakturist.eu>';

export const INTEGRATIONS = {
  smtp: {
    label: { bg: 'Поща (Brevo SMTP)', en: 'Email (Brevo SMTP)' },
    help: {
      bg: 'Писмата към шкафчетата и поканите за прехвърляне. Данните са в Brevo → SMTP & API → SMTP. Порт 2525 минава и там, където 25, 465 и 587 са блокирани.',
      en: 'Inbox notifications and transfer invitations. Find the values in Brevo → SMTP & API → SMTP. Port 2525 works where 25, 465 and 587 are blocked.',
    },
    fields: [
      {
        name: 'host',
        kind: 'text',
        secret: false,
        label: { bg: 'SMTP сървър', en: 'SMTP server' },
        placeholder: 'smtp-relay.brevo.com',
      },
      {
        name: 'port',
        kind: 'number',
        secret: false,
        label: { bg: 'Порт', en: 'Port' },
        placeholder: '2525',
      },
      {
        name: 'secure',
        kind: 'checkbox',
        secret: false,
        label: { bg: 'TLS от началото на връзката', en: 'TLS from the start' },
        help: {
          bg: 'Само за порт 465. На 2525 и 587 връзката минава на TLS със STARTTLS — без него не се свързва.',
          en: 'Port 465 only. On 2525 and 587 the connection upgrades to TLS with STARTTLS — or does not connect.',
        },
      },
      {
        name: 'user',
        kind: 'text',
        secret: false,
        label: { bg: 'Вход (SMTP login)', en: 'Login (SMTP login)' },
      },
      {
        name: 'pass',
        kind: 'secret',
        secret: true,
        label: { bg: 'SMTP ключ', en: 'SMTP key' },
      },
      {
        name: 'from',
        kind: 'text',
        secret: false,
        label: { bg: 'Подател', en: 'Sender' },
        help: {
          bg: 'Адресът трябва да е потвърден подател (или домейн) в Brevo.',
          en: 'The address must be a verified sender (or domain) in Brevo.',
        },
        placeholder: DEFAULT_MAIL_FROM,
      },
    ],
    defaults: { host: '', port: 2525, secure: false, user: '', from: DEFAULT_MAIL_FROM },
  },
  revolut: {
    label: { bg: 'Revolut Merchant API', en: 'Revolut Merchant API' },
    help: {
      bg: 'Ключовете са в Revolut Business → Merchant API. Sandbox и продукцията имат различни ключове. Тайната на webhook-а проверява известията за платени поръчки.',
      en: 'Find the keys in Revolut Business → Merchant API. Sandbox and production have separate keys. The webhook secret verifies paid-order notifications.',
    },
    fields: [
      {
        name: 'environment',
        kind: 'select',
        secret: false,
        label: { bg: 'Среда', en: 'Environment' },
        options: ['sandbox', 'production'],
      },
      {
        name: 'secretKey',
        kind: 'secret',
        secret: true,
        label: { bg: 'Secret API key', en: 'Secret API key' },
        help: {
          bg: 'Ползва се за проверката на връзката и за плащанията с карта (етап 2).',
          en: 'Used for the connection check and for card payments (stage 2).',
        },
      },
      {
        name: 'webhookSecret',
        kind: 'secret',
        secret: true,
        label: { bg: 'Тайна на webhook-а (wsk_…)', en: 'Webhook signing secret (wsk_…)' },
      },
    ],
    defaults: { environment: 'sandbox' },
  },
  peppol: {
    label: { bg: 'Peppol (eConnect)', en: 'Peppol (eConnect)' },
    help: {
      bg: 'Точката за достъп до мрежата Peppol — eConnect International (сертифициран доставчик на OpenPeppol). Данните за API клиента (client credentials, обхват „ap“) са от договора с eConnect; acceptance е тестовата им среда. Без тях изпращането и получаването през Peppol са изключени.',
      en: 'The access point to the Peppol network — eConnect International (an OpenPeppol certified provider). The API client details (client credentials, scope “ap”) come from the eConnect contract; acceptance is their test environment. Without them, sending and receiving via Peppol are off.',
    },
    fields: [
      {
        name: 'environment',
        kind: 'select',
        secret: false,
        label: { bg: 'Среда', en: 'Environment' },
        options: ['acceptance', 'production'],
      },
      {
        name: 'clientId',
        kind: 'text',
        secret: false,
        label: { bg: 'Client ID', en: 'Client ID' },
      },
      {
        name: 'clientSecret',
        kind: 'secret',
        secret: true,
        label: { bg: 'Client secret', en: 'Client secret' },
      },
    ],
    defaults: { environment: 'acceptance', clientId: '' },
  },
} as const satisfies Record<IntegrationCode, IntegrationDefinition>;

export function isIntegrationCode(value: string): value is IntegrationCode {
  return value === 'smtp' || value === 'revolut' || value === 'peppol';
}
