// The texts of the fields' «?» (round 52): what each field is for, in Italian, from the user guide (docs/guida-utente),
// one file per area in messages/aiuto/ (a component imports only its area's, so a page ships only its own texts). A key
// with no text gives null: the label stays bare (components/aiuto/Etichetta.tsx).
export type TestiAiuto = Readonly<Record<string, string>>;

export const testoAiuto = (testi: TestiAiuto, chiave: string): string | null =>
  Object.prototype.hasOwnProperty.call(testi, chiave) ? (testi[chiave] ?? null) : null;
