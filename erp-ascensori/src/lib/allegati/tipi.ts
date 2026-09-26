// Какво изобщо приемаме като прикачен файл — и защо толкова малко.
//
// Качването е класическата повърхност за нападение: обхождане на пътища,
// съхранен XSS, изпълнение на код. Затова тук всичко е ЗАТВОРЕН списък и нищо
// не се извежда от това, което казва браузърът.
//
// Три правила, които не се нарушават:
//
//   1. Типът се ПОДУШВА от съдържанието, не се вярва на `Content-Type` и на
//      разширението. И двете са изцяло под контрола на изпращача.
//   2. Името на файла на диска НИКОГА не е името на потребителя. Пътят се
//      строи от UUID; оригиналното име е само етикет в базата.
//   3. SVG е забранен. Той е XML и носи `<script>` — качен SVG, отворен в
//      браузъра, е изпълним код в нашия домейн.
//
// Модулът е чист: вход байтове и низове, изход решение. Затова носи тестове.

export interface TipoPermesso {
  mime: string;
  estensione: string;
  /** Първите байтове, по които типът се разпознава. */
  firme: readonly (readonly number[])[];
  etichetta: string;
}

/**
 * Разрешените типове.
 *
 * Списъкът е ЗАТВОРЕН и умишлено къс: сертификати, протоколи и снимки от
 * обекта. Всичко останало (архиви, документи на Office, изпълними) е или
 * ненужно, или носи макроси и разархивиране — рискове без стойност тук.
 */
export const TIPI_PERMESSI: readonly TipoPermesso[] = [
  {
    mime: "application/pdf",
    estensione: "pdf",
    firme: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    etichetta: "PDF",
  },
  {
    mime: "image/jpeg",
    estensione: "jpg",
    firme: [[0xff, 0xd8, 0xff]],
    etichetta: "JPEG",
  },
  {
    mime: "image/png",
    estensione: "png",
    firme: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    etichetta: "PNG",
  },
  {
    mime: "image/webp",
    estensione: "webp",
    // RIFF....WEBP — вторите четири байта са размерът, затова се проверява на
    // две части (виж `riconosci`).
    firme: [[0x52, 0x49, 0x46, 0x46]],
    etichetta: "WebP",
  },
];

/** Таванът на един файл: 20 MB. Сканиран протокол се побира с голям запас. */
export const DIMENSIONE_MASSIMA = 20 * 1024 * 1024;

function iniziaCon(dati: Uint8Array, firma: readonly number[]): boolean {
  if (dati.length < firma.length) return false;
  return firma.every((b, i) => dati[i] === b);
}

/**
 * Типът, разпознат ОТ СЪДЪРЖАНИЕТО.
 *
 * `null` значи „не го приемаме“ — включително когато байтовете не съвпадат с
 * нищо от списъка. Позволяването на непознат тип „за всеки случай“ обезсмисля
 * целия списък.
 */
export function riconosci(dati: Uint8Array): TipoPermesso | null {
  for (const t of TIPI_PERMESSI) {
    if (!t.firme.some((f) => iniziaCon(dati, f))) continue;
    // WebP: след RIFF и четирите байта размер трябва да стои „WEBP“. Без тази
    // втора проверка всеки RIFF контейнер (напр. AVI) минава за картинка.
    if (t.mime === "image/webp") {
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (dati.length < 12 || !webp.every((b, i) => dati[8 + i] === b))
        continue;
    }
    return t;
  }
  return null;
}

/**
 * Името, което ПОКАЗВАМЕ. На диска не отива.
 *
 * Махат се разделителите на пътища, управляващите знаци и водещите точки:
 * „../../etc/passwd“ става „etc_passwd“, а „.bashrc“ — „bashrc“. Дори това име
 * никога не се долепя до път — стойността му е само за списъка и за
 * `Content-Disposition`.
 */
export function nomeSicuro(nome: string): string {
  const base = String(nome ?? "")
    // Управляващите знаци първи: „\r\n“ в името чупи `Content-Disposition` и
    // оттам се инжектират чужди хедъри.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    // Поредици от точки и долни черти се свиват до една: „../../etc/passwd“
    // иначе става „_._etc_passwd“ — безопасно, но нечетимо.
    .replace(/[._]{2,}/g, "_")
    .replace(/^[._\s]+/, "")
    .trim();
  return (base || "allegato").slice(0, 200);
}

/**
 * Пътят на диска.
 *
 * Строи се ИЗЦЯЛО от стойности, които контролираме: обхват по фирма, година,
 * месец, UUID и разширение от подушения тип. Нищо, дошло от потребителя, не
 * влиза в него — затова обхождане на пътища е невъзможно по устройство, а не
 * по проверка.
 */
export function percorsoRelativo(opts: {
  tenantId: string | null;
  id: string;
  estensione: string;
  data: Date;
}): string {
  const anno = opts.data.getUTCFullYear();
  const mese = String(opts.data.getUTCMonth() + 1).padStart(2, "0");
  // `_` е обхватът на еднофирмената инсталация: празна папка би дала двойна
  // наклонена черта и път извън очакваното дърво.
  const scope = opts.tenantId ?? "_";
  return `${scope}/${anno}/${mese}/${opts.id}.${opts.estensione}`;
}

/** Приема ли се файл с тези байтове и този размер — и защо не, на италиански. */
export function validaAllegato(
  dati: Uint8Array,
  dimensione: number,
): { tipo: TipoPermesso } | { errore: string } {
  if (dimensione <= 0) return { errore: "File vuoto." };
  if (dimensione > DIMENSIONE_MASSIMA)
    return {
      errore: `File troppo grande: massimo ${Math.floor(DIMENSIONE_MASSIMA / (1024 * 1024))} MB.`,
    };
  const tipo = riconosci(dati);
  if (!tipo)
    return {
      errore: `Formato non ammesso. Sono accettati: ${TIPI_PERMESSI.map((t) => t.etichetta).join(", ")}.`,
    };
  return { tipo };
}
