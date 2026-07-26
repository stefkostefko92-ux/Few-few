// Валидация на подписа, получен от платното — ЧИСТА логика, тествана без база.
//
// Подписът пристига като data URL от `canvas.toDataURL()`. Той идва от клиента,
// значи е недоверен вход като всеки друг: без проверка тук маршрутът приема
// произволен низ (или мегабайтово изображение) и го записва в базата, откъдето
// после излиза в PDF и в браузъра на следващия, който отвори документа.

/** Само PNG: платното произвежда точно това, а SVG носи скриптове. */
const PREFISSO = "data:image/png;base64,";

/** Таван от 512 KB: подпис с мишка/пръст е под 30 KB дори на голямо платно. */
export const MAX_BYTE_FIRMA = 512 * 1024;

export interface EsitoFirma {
  valida: boolean;
  /** Италианско съобщение за потребителя, когато не е валиден. */
  errore?: string;
}

export function validaFirma(dataUrl: string): EsitoFirma {
  if (!dataUrl.startsWith(PREFISSO))
    return { valida: false, errore: "Formato della firma non valido" };

  const base64 = dataUrl.slice(PREFISSO.length);
  // Строг base64: без интервали и без URL-безопасната азбука, за да не се
  // промъкне нещо, което после се декодира различно.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0)
    return { valida: false, errore: "Formato della firma non valido" };

  const byte = Math.floor((base64.length * 3) / 4);
  if (byte > MAX_BYTE_FIRMA)
    return { valida: false, errore: "Firma troppo grande" };
  // Празното платно дава няколкостотин байта; изискваме нещо реално нарисувано.
  if (byte < 200)
    return {
      valida: false,
      errore: "Firma assente: firmare nello spazio indicato",
    };

  // Проверка на самия PNG подпис (\x89PNG\r\n\x1a\n) — разширението и типът в
  // data URL-а са само твърдение на клиента.
  const testa = Buffer.from(base64.slice(0, 16), "base64");
  const magico = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (magico.some((b, i) => testa[i] !== b))
    return { valida: false, errore: "Formato della firma non valido" };

  return { valida: true };
}

/** Подписаният отчет не се променя — това е смисълът на подписа. */
export function rapportinoModificabile(
  firmatoAt: Date | null | undefined,
): boolean {
  return !firmatoAt;
}
