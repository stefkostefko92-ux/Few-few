import type { ParsedSettings } from '../settings.js';
import { jsmConnector } from './jsm.js';
import type { ConnectorContext, DeliveryContext, DeliveryResult, TestResult } from './types.js';
import { webhookConnector } from './webhook.js';
import { zendeskConnector, zendeskOrigin, type ZendeskOrigin } from './zendesk.js';

/** Изборът на конектор по вида — едно място, за да е изчерпателно (TypeScript проверява `kind`). */

type Base = Omit<ConnectorContext<object>, 'settings'>;
type DeliveryBase = Omit<DeliveryContext<object>, 'settings'>;

export function deliverWith(
  parsed: ParsedSettings,
  ctx: DeliveryBase,
  origin: ZendeskOrigin = zendeskOrigin,
): Promise<DeliveryResult> {
  switch (parsed.kind) {
    case 'WEBHOOK':
      return webhookConnector.deliver({ ...ctx, settings: parsed.settings });
    case 'ZENDESK':
      return zendeskConnector(origin).deliver({ ...ctx, settings: parsed.settings });
    case 'JSM':
      return jsmConnector.deliver({ ...ctx, settings: parsed.settings });
  }
}

export function testWith(
  parsed: ParsedSettings,
  ctx: Base,
  origin: ZendeskOrigin = zendeskOrigin,
): Promise<TestResult> {
  switch (parsed.kind) {
    case 'WEBHOOK':
      return webhookConnector.test({ ...ctx, settings: parsed.settings });
    case 'ZENDESK':
      return zendeskConnector(origin).test({ ...ctx, settings: parsed.settings });
    case 'JSM':
      return jsmConnector.test({ ...ctx, settings: parsed.settings });
  }
}

export type { ZendeskOrigin };
