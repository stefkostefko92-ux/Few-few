// Кодиране на черновата за живия преглед (base64url JSON) — без зависимости,
// ползва се и в браузъра (LivePreview). Валидацията е в preview-draft.ts.

export type PreviewDraft = {
  /** Тема (id от PROFILE_THEMES). */
  theme?: string;
  /** Акцент (#rrggbb или '' = без). */
  accent?: string;
  /** Полетата на формата „Персонализация“ (сурови, както при запис). */
  style?: Record<string, string>;
  /** Име/био по език. */
  tr?: Record<string, { n?: string; b?: string }>;
  /** Заглавия на блокове: linkId → език → заглавие. */
  lt?: Record<string, Record<string, string>>;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Кодира черновата за адреса (браузър и сървър). Празна → ''. */
export function encodeDraft(draft: PreviewDraft): string {
  if (Object.keys(draft).length === 0) return '';
  return toBase64Url(new TextEncoder().encode(JSON.stringify(draft)));
}
