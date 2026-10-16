// «Segnala un problema» (round 48): what a signed-in user sends from inside the application — a problem, a suggestion or
// a question — kept in LiftPilot's database (Feedback, migration 24_feedback) and read by the platform's administrators
// (/app/admin/segnalazioni). Without a database (tested alone, and read by the form in the browser): the kinds, the
// limits and the checks of what the form and the address carry. The company and the user come from the session, never
// from here.
import { z } from 'zod';

export const FEEDBACK_KINDS = ['BUG', 'IDEA', 'QUESTION'] as const;
export type FeedbackKindValue = (typeof FEEDBACK_KINDS)[number];

/** The longest message (characters, after trimming). */
export const FEEDBACK_MAX = 4000;
/** Reports a person may send in an hour. */
export const FEEDBACK_PER_HOUR = 10;
/** The longest page path kept (the address the report came from). */
export const PAGE_MAX = 300;
/** The rows the administrators' page shows at once (newest first). */
export const FEEDBACK_PAGE = 200;

/** A page of LiftPilot as the report names it: a path of its own (one leading slash, no scheme, no host, no query, no
 *  fragment), letters, digits and the few signs its addresses use; the locale in front is dropped (the interface has one).
 *  Anything else — another site, a script, an encoded trick — is no page: null. */
export function pagePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim().split(/[?#]/, 1)[0] ?? '';
  if (!/^\/(?!\/)[A-Za-z0-9/_.-]*$/.test(path) || path.length > PAGE_MAX || path.includes('..')) return null;
  const bare = path.replace(/^\/it(?=\/|$)/, '');
  return bare === '' ? '/' : bare;
}

/** The code of an error page (Next's digest: digits, sometimes letters and dashes), or null. */
export function errorCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  return /^[A-Za-z0-9-]{1,64}$/.test(code) ? code : null;
}

/** The form as sent: the kind, the message (required, at most FEEDBACK_MAX characters), the page and the code it came
 *  with (checked again: they come from the address, which anybody can write). */
export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1).max(FEEDBACK_MAX),
  page: z.string().transform((v, ctx) => {
    const p = pagePath(v);
    if (p === null) {
      ctx.addIssue({ code: 'custom', message: 'page' });
      return z.NEVER;
    }
    return p;
  }),
  digest: z.string().transform((v) => (v.trim() === '' ? null : errorCode(v))),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** The answer of the report's action: sent, or why not (messages: feedback.error.<code>), with what was typed so the
 *  form shows it again. */
export type FeedbackState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; error: 'invalid' | 'forbidden' | 'rateLimited' | 'sessionExpired' | 'offline' | 'failed'; fields?: string[];
    values?: { kind: string; message: string } };

export const initialFeedbackState: FeedbackState = { status: 'idle' };

/** The administrators' list: only the reports still to handle (the default), or all of them. */
export const feedbackFilter = (raw: unknown): 'open' | 'all' => (raw === 'tutte' ? 'all' : 'open');
