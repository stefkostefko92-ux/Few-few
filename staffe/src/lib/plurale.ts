/**
 * Accordo singolare/plurale per i testi generati.
 *
 * I riepiloghi si costruiscono concatenando numeri e parole, e con un solo
 * elemento uscivano frasi come «1 articoli sono sotto il punto di riordino».
 * In un prodotto scritto in italiano per un'azienda italiana quella «i» finale
 * è la prima cosa che l'utente nota — e fa sembrare sbagliato anche il numero
 * accanto, che invece è giusto.
 *
 * Niente libreria: l'italiano ha due sole forme (uno / molti), come l'inglese.
 * `Intl.PluralRules` darebbe la stessa risposta con più cerimonia.
 */

/** «1 articolo» · «3 articoli». */
export function plurale(n: number, singolare: string, plurale_: string): string {
  return `${n} ${n === 1 ? singolare : plurale_}`;
}

/** Solo la parola, senza il numero davanti. */
export function parola(n: number, singolare: string, plurale_: string): string {
  return n === 1 ? singolare : plurale_;
}

/** «è» / «sono» — il verbo essere alla terza persona. */
export function essere(n: number): string {
  return n === 1 ? 'è' : 'sono';
}

/** «ha» / «hanno». */
export function avere(n: number): string {
  return n === 1 ? 'ha' : 'hanno';
}
