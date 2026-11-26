// Формата за редакция, начертана от описанието на полетата (content/campi.ts). Работи и без JS
// (винаги има един празен ред в края на всеки списък); с JS — добавяне, махане и подреждане на редове.
import { CAMPI, type Campo, type Valori } from "../content/campi.js";
import { esc } from "./html.js";

const AIUTO_TESTO = "Formato: righe vuote tra i paragrafi, «- » per gli elenchi, **grassetto**, [testo](/percorso o https://…).";

function contatore(c: Campo): string {
  return c.max ? ` data-max="${c.max}"${c.min ? ` data-min="${c.min}"` : ""}` : "";
}

function riga(c: Campo, valori: string[], colonne: Array<{ etichetta: string; lungo?: boolean }>, i: number): string {
  return `<div class="riga">${colonne
    .map((col, k) => {
      const id = `f_${c.nome}_${k}_${i}`;
      const v = esc(valori[k] ?? "");
      const ctrl = col.lungo
        ? `<textarea id="${id}" name="f_${c.nome}_${k}" rows="${c.tipo === "sezioni" ? 7 : 3}">${v}</textarea>`
        : `<input id="${id}" name="f_${c.nome}_${k}" value="${v}">`;
      return `<label for="${id}">${esc(col.etichetta)}</label>${ctrl}`;
    })
    .join("")}<div class="riga-azioni"><button type="button" class="link" data-su>Su</button><button type="button" class="link" data-giu>Giù</button><button type="button" class="link" data-rimuovi>Rimuovi</button></div></div>`;
}

function gruppo(c: Campo, righe: string[][], colonne: Array<{ etichetta: string; lungo?: boolean }>): string {
  const vuota = colonne.map(() => "");
  const tutte = [...righe, vuota];
  return `<div class="ripeti" data-ripeti="${c.nome}">${tutte.map((r, i) => riga(c, r, colonne, i)).join("")}<template>${riga(c, vuota, colonne, 999)}</template><button type="button" class="btn btn-sec" data-aggiungi>Aggiungi</button></div>`;
}

const COLONNE: Partial<Record<Campo["tipo"], Array<{ etichetta: string; lungo?: boolean }>>> = {
  coppie: [{ etichetta: "Titolo" }, { etichetta: "Testo", lungo: true }],
  coppieTesto: [{ etichetta: "Termine" }, { etichetta: "Definizione", lungo: true }],
  faq: [{ etichetta: "Domanda" }, { etichetta: "Risposta (la prima frase è la risposta diretta)", lungo: true }],
  sezioni: [{ etichetta: "Titolo della sezione (meglio come domanda)" }, { etichetta: "Testo (il primo paragrafo è la risposta diretta)", lungo: true }],
  fonti: [{ etichetta: "Etichetta" }, { etichetta: "Indirizzo (https://…)" }],
  orari: [{ etichetta: "Etichetta (es. Lunedì–venerdì)" }, { etichetta: "Giorni (lun, mar…)" }, { etichetta: "Dalle (HH:MM)" }, { etichetta: "Alle (HH:MM)" }],
};

export function campiForm(tipo: string, valori: Valori, errori: Record<string, string>): string {
  return (CAMPI[tipo] ?? [])
    .map((c) => {
      const err = errori[c.nome] ? `<p class="errore-campo" id="e_${c.nome}">${esc(errori[c.nome] ?? "")}</p>` : "";
      const aiuto = c.aiuto ? `<p class="nota">${esc(c.aiuto)}</p>` : "";
      const v = valori[c.nome];
      let ctrl: string;
      switch (c.tipo) {
        case "testo":
        case "keywords":
          ctrl =
            (c.max ?? 0) > 160
              ? `<textarea id="f_${c.nome}" name="f_${c.nome}" rows="3"${contatore(c)}>${esc(String(v ?? ""))}</textarea>`
              : `<input id="f_${c.nome}" name="f_${c.nome}" value="${esc(String(v ?? ""))}"${contatore(c)}>`;
          break;
        case "inline":
          ctrl = `<textarea id="f_${c.nome}" name="f_${c.nome}" rows="4"${contatore(c)}>${esc(String(v ?? ""))}</textarea><p class="nota">${AIUTO_TESTO}</p>`;
          break;
        case "lista": {
          const righe = ((v as string[] | undefined) ?? []).map((x) => [x]);
          ctrl = gruppo(c, righe, [{ etichetta: "Voce", lungo: true }]).replace(/name="f_([a-zA-Z]+)_0"/g, 'name="f_$1"');
          break;
        }
        default:
          ctrl = gruppo(c, (v as string[][] | undefined) ?? [], COLONNE[c.tipo] ?? []);
      }
      const solo = ["testo", "keywords", "inline"].includes(c.tipo);
      return `<fieldset class="campo${errori[c.nome] ? " con-errore" : ""}"><legend>${solo ? `<label for="f_${c.nome}">${esc(c.etichetta)}</label>` : esc(c.etichetta)}</legend>${aiuto}${ctrl}${err}</fieldset>`;
    })
    .join("");
}
