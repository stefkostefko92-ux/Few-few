/**
 * Типовете на двигателя за допустимост. Двигателят е чист (без база, без мрежа, без часовник —
 * `now` идва отвън), за да се тества изчерпателно. Правната основа е в SPEC.md §5.
 */
export type Market = 'BG' | 'IT';
export type Channel = 'email' | 'phone' | 'form' | 'linkedin';
export type Decision = 'allowed' | 'needs_action' | 'blocked';
export type RegistryName = 'KZP' | 'RPO';
export type EmailKind = 'generic' | 'named' | 'personal';
export type PhoneKind = 'mobile' | 'landline' | 'unknown';

/** Откъде е номерът. За Италия обаждане без съгласие е допустимо само от публичен указател. */
export type PhoneSource = 'public_directory' | 'company_site' | 'business_registry' | 'other';

export interface ConsentRecord {
  channel: Channel;
  givenAt: Date;
  withdrawnAt: Date | null;
}

/** Последната проверка на стойността (или на домейна ѝ) в регистъра за отказ. */
export interface RegistryStatus {
  registry: RegistryName;
  listed: boolean;
  checkedAt: Date;
}

export interface Policy {
  /** Колко дни важи проверка в RPO. По-кратко е по-безопасно. */
  rpoMaxAgeDays: number;
  /** Колко дни важи проверка в регистъра на КЗП (наша политика). */
  kzpMaxAgeDays: number;
}

export interface ContactTarget {
  market: Market;
  channel: Channel;
  /** Имейл, телефон или URL (форма, LinkedIn профил). */
  value: string;
  /** Откъде е контактът. Без източник — не се ползва (чл. 14(2)(f), чл. 5(2) ОРЗД). */
  sourceUrl: string | null;
  phoneSource?: PhoneSource;
  /** Собственикът е потвърдил, че мобилният номер е фирмена линия. */
  businessLineConfirmed?: boolean;
}

export interface EvaluationContext {
  now: Date;
  suppressed: boolean;
  consents: ConsentRecord[];
  registry: RegistryStatus | null;
  policy: Policy;
}

export type ReasonCode =
  | 'suppressed'
  | 'source_missing'
  | 'invalid_value'
  | 'it_consent_required'
  | 'it_phone_not_public_directory'
  | 'rpo_listed'
  | 'rpo_check_missing'
  | 'rpo_check_stale'
  | 'kzp_listed'
  | 'kzp_check_missing'
  | 'kzp_check_stale'
  | 'personal_email_domain'
  | 'bg_mobile_needs_business_confirmation'
  | 'consent_present'
  | 'registry_clear'
  | 'legal_uncertain';

export type RequirementCode =
  | 'art14_notice'
  | 'art21_objection'
  | 'sender_identity'
  | 'unsubscribe_link'
  | 'unsolicited_subject_marker'
  | 'it_commercial_marker'
  | 'call_identity'
  | 'manual_only';

export type Effect = 'block' | 'action' | 'info';

export interface Reason {
  code: ReasonCode;
  effect: Effect;
  text: string;
}

export interface Requirement {
  code: RequirementCode;
  text: string;
}

export interface Verdict {
  market: Market;
  channel: Channel;
  normalizedValue: string | null;
  /** Източникът, с който е направена проверката (черновата го цитира по чл. 14(2)(f) ОРЗД). */
  sourceUrl: string | null;
  decision: Decision;
  reasons: Reason[];
  requirements: Requirement[];
  /** Кой регистър за отказ трябва да е проверен за този канал и пазар (ако има такъв). */
  registryNeeded: RegistryName | null;
  emailKind?: EmailKind;
  phoneKind?: PhoneKind;
}
