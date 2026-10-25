import { config } from '../config.js';
import { RETENTION } from '../content.js';
import { HEATMAP_WINDOW_DAYS } from '../heatmap.js';

/**
 * Числата и фирмените данни в правните текстове (поверителност, импресум, llms.txt) — отделно от `pages.ts`, за да
 * остане той по-кратък. Сроковете идват от същите константи, които ползват задачите за чистене (§7).
 */
/** Числата в правните текстове — от същите константи, които ползват задачите за чистене. */
export function legalParams(): Record<string, string | number> {
  const cfg = config();
  return {
    sessionsDays: RETENTION.sessionsDays,
    killsDays: RETENTION.killsDays,
    matchesDays: RETENTION.matchesDays,
    duelsDays: RETENTION.duelsDays,
    missionsDays: RETENTION.missionsDays,
    casesDays: RETENTION.casesDays,
    demosDays: RETENTION.demosDays,
    heatmapDays: HEATMAP_WINDOW_DAYS,
    site: cfg.PUBLIC_BASE_URL.replace(/^https?:\/\//, ''),
    company: cfg.COMPANY_LEGAL_NAME ?? 'Carbon Stealth VCC',
  };
}

/** Полетата на импресума: стойност от конфигурацията или null → „не е въведено“ на страницата. */
export function companyFields(): Array<{ id: string; value: string | null; env: string }> {
  const cfg = config();
  return [
    { id: 'legalName', value: cfg.COMPANY_LEGAL_NAME ?? null, env: 'COMPANY_LEGAL_NAME' },
    { id: 'address', value: cfg.COMPANY_ADDRESS ?? null, env: 'COMPANY_ADDRESS' },
    { id: 'eik', value: cfg.COMPANY_EIK ?? null, env: 'COMPANY_EIK' },
    { id: 'vat', value: cfg.COMPANY_VAT ?? null, env: 'COMPANY_VAT' },
    {
      id: 'representative',
      value: cfg.COMPANY_REPRESENTATIVE ?? null,
      env: 'COMPANY_REPRESENTATIVE',
    },
    { id: 'email', value: cfg.CONTACT_EMAIL ?? null, env: 'CONTACT_EMAIL' },
    { id: 'phone', value: cfg.COMPANY_PHONE ?? null, env: 'COMPANY_PHONE' },
  ];
}
