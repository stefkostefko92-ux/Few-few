// Логото на фирмата — проверка и почистване на качения файл. Чисто.
//
// Само PNG и JPEG: това са форматите, които pdfkit вгражда. SVG е изключен
// нарочно — той е документ със скриптове, не картинка, и отворен направо в
// браузъра е XSS. Видът се разпознава по СЪДЪРЖАНИЕТО (магическите байтове),
// никога по името или по Content-Type от клиента.
//
// Метаданните се махат: снимка от телефон носи EXIF с GPS координатите на
// мястото, където е направена, и модела на телефона. Логото отива на всеки
// документ към клиента — не бива да носи нищо от това.

export const LOGO_MAX_BYTE = 512 * 1024;
export const LOGO_MAX_LATO = 4000;

export type TipoLogo = "image/png" | "image/jpeg";

export interface InfoLogo {
  tipo: TipoLogo;
  larghezza: number;
  altezza: number;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Разпознава файла и чете размерите; `null` за всичко, което не е PNG/JPEG. */
export function riconosciLogo(b: Uint8Array): InfoLogo | null {
  if (b.length > 24 && FIRMA_PNG.every((v, i) => b[i] === v)) {
    // Първият блок е IHDR: ширина и височина, big-endian, от байт 16.
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return {
      tipo: "image/png",
      larghezza: dv.getUint32(16),
      altezza: dv.getUint32(20),
    };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Размерите са в SOFn (0xC0–0xCF без C4, C8, CC).
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const lung = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return {
          tipo: "image/jpeg",
          altezza: (b[i + 5] << 8) | b[i + 6],
          larghezza: (b[i + 7] << 8) | b[i + 8],
        };
      i += 2 + lung;
    }
  }
  return null;
}

/** Проверка за качване: италианското съобщение за човека или `null`. */
export function erroreLogo(b: Uint8Array): string | null {
  if (b.length === 0) return "File vuoto.";
  if (b.length > LOGO_MAX_BYTE)
    return "Il logo supera 512 KB: salvarlo in una risoluzione più bassa.";
  const info = riconosciLogo(b);
  if (!info) return "Formato non supportato: caricare un'immagine PNG o JPEG.";
  if (
    info.larghezza < 1 ||
    info.altezza < 1 ||
    info.larghezza > LOGO_MAX_LATO ||
    info.altezza > LOGO_MAX_LATO
  )
    return `Dimensioni non valide: il lato massimo è ${LOGO_MAX_LATO} pixel.`;
  return null;
}

/** Блоковете на PNG, които носят текст, дати и EXIF — не са нужни за образа. */
const PNG_METADATI = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);

/**
 * Копие без метаданни. PNG: пропуска текстовите блокове и EXIF. JPEG: пропуска
 * сегментите APP1–APP15 (EXIF, XMP, Photoshop) и коментарите; APP0 (JFIF)
 * остава — някои четци го искат. Непознатото се връща непроменено.
 */
export function pulisciLogo(b: Uint8Array): Uint8Array {
  const info = riconosciLogo(b);
  if (!info) return b;
  const parti: Uint8Array[] = [];
  if (info.tipo === "image/png") {
    parti.push(b.subarray(0, 8));
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let i = 8;
    while (i + 12 <= b.length) {
      const lung = dv.getUint32(i);
      const tipo = String.fromCharCode(...b.subarray(i + 4, i + 8));
      const fine = i + 12 + lung;
      if (fine > b.length) break;
      if (!PNG_METADATI.has(tipo)) parti.push(b.subarray(i, fine));
      i = fine;
      if (tipo === "IEND") break;
    }
  } else {
    parti.push(b.subarray(0, 2));
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const m = b[i + 1];
      // Началото на данните на образа: оттук нататък всичко остава както е.
      if (m === 0xda) {
        parti.push(b.subarray(i));
        break;
      }
      const fine = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
      const metadato = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
      if (!metadato) parti.push(b.subarray(i, fine));
      i = fine;
    }
  }
  const out = new Uint8Array(parti.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parti) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
