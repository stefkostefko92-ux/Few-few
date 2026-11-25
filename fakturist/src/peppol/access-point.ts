/**
 * Точката за достъп до мрежата Peppol зад интерфейс (SPEC 58–60): днес eConnect PSB (econnect.ts), утре —
 * друг доставчик или собствена точка, без промяна за останалия код. Грешките са с код, без тайни.
 */
export interface EnrollInput {
  partyId: string;
  name: string;
  address: string;
  countryCode: string;
  /** Адресът за известията с тайната след „#“ (така eConnect подписва с HMAC). */
  hookUrl: string;
}

export interface AccessPoint {
  /** Проверка на връзката и правата (GET /api/v1/me при eConnect). */
  check(): Promise<void>;
  /** Качва UBL документа; `documentId` е нашият UUID — повторение със същия е „вече прието“. */
  send(input: {
    senderPartyId: string;
    documentId: string;
    ubl: string;
  }): Promise<{ alreadyAccepted: boolean }>;
  /** Може ли получателят да приема фактури през Peppol: true / false / null (неясно). */
  canReceive(input: { senderPartyId: string; receiverPartyId: string }): Promise<boolean | null>;
  enroll(input: EnrollInput): Promise<void>;
  unenroll(partyId: string): Promise<void>;
  /** Полученият документ като UBL XML. */
  download(input: { partyId: string; documentId: string }): Promise<string>;
}

export class AccessPointError extends Error {
  constructor(
    readonly code: 'notConfigured' | 'unauthorized' | 'network' | 'rejected' | 'invalidResponse',
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }

  /** Временна ли е грешката (мрежа, 429, 5xx) — работникът опитва пак. */
  get retryable(): boolean {
    return (
      this.code === 'network' ||
      (this.status !== null && (this.status === 429 || this.status >= 500))
    );
  }
}
