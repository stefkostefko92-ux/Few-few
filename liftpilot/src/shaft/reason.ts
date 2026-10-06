// Case c) of DM 236/1989 8.1.12 rests on the reason the existing building takes no larger car: written in words in the
// design (check v_acc_c, layout.ts) and printed in the relazione. Pure.

/** The letters a reason has at least (input sanity, not a value of a standard). */
export const REASON_LETTERS = 10;

/** Control and format characters — bidirectional overrides, zero widths —: never part of a reason. */
const HIDDEN = /[\p{Cc}\p{Cf}]/gu;

/** A reason as typed, without the hidden characters a paste can bring. */
export const reasonText = (s: string): string => s.replace(HIDDEN, '');

/** Whether a reason is written: no hidden characters, at least REASON_LETTERS letters. */
export const reasonGiven = (s: string | undefined): boolean =>
  !!s && reasonText(s) === s && (s.match(/\p{L}/gu)?.length ?? 0) >= REASON_LETTERS;
