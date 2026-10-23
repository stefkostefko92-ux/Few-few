// The message a page shows after «Collega» / «Scollega» (round 44, src/server/collega/actions.ts `?lk=<esito>`): one
// list for the survey's link panel and the installation's surveys (messages: collega.flash.<esito>). Pure.

export const FLASH = ['linked', 'unlinked', 'forbidden', 'readOnly', 'tooMany', 'notFound', 'projectNotFound', 'archived', 'changed'] as const;
export type Flash = (typeof FLASH)[number];

export const isFlash = (x: unknown): x is Flash => typeof x === 'string' && (FLASH as readonly string[]).includes(x);

/** The message is good news (the link changed as asked), else a warning. */
export const flashOk = (f: Flash): boolean => f === 'linked' || f === 'unlinked';
