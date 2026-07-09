// Категории за DSA сигналите „Докладвай този профил“ (чл. 16).
export const REPORT_CATEGORIES = [
  'impersonation',
  'phishing',
  'illegal',
  'adult',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
