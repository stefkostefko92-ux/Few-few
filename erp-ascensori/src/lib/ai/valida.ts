// Проверка на това, което моделът е върнал.
//
// Тук е границата между „AI каза“ и „системата прие“. Всичко отвъд нея вече е
// обикновени данни: минали са през същата схема, през която минава и ръчно
// попълнената форма.
//
// ПОЛЕ ПО ПОЛЕ, не наведнъж. Изкушението е да се подаде целият обект на
// `schema.safeParse` — но тогава една сгрешена дата проваля и другите дванайсет
// правилно прочетени полета, а операторът получава „грешка“ вместо дванайсет
// готови стойности и една за дописване. Извличането е частично по природа;
// проверката трябва да е също.

import type { ZodTypeAny } from "zod";

export interface CampoScartato {
  campo: string;
  /** Защо е отпаднало — на италиански, за оператора. */
  motivo: string;
}

export interface EsitoValidazione {
  /** Приетите стойности, вече преобразувани от схемата. */
  campi: Record<string, unknown>;
  scartati: CampoScartato[];
}

type ConShape = { shape?: Record<string, ZodTypeAny> };

/**
 * Пресява отговора през схемата на формата.
 *
 * Непознатите ключове НЕ се пропускат тихо: моделът може да е измислил поле, а
 * мълчаливото им махане би скрило, че указанието и схемата са се разминали.
 */
export function validaEstrazione(
  schema: ZodTypeAny,
  dati: unknown,
): EsitoValidazione {
  const campi: Record<string, unknown> = {};
  const scartati: CampoScartato[] = [];

  if (!dati || typeof dati !== "object" || Array.isArray(dati))
    return {
      campi,
      scartati: [{ campo: "—", motivo: "La risposta non è un oggetto JSON." }],
    };

  const shape = (schema as ConShape).shape ?? {};

  for (const [chiave, valore] of Object.entries(
    dati as Record<string, unknown>,
  )) {
    const campoSchema = shape[chiave];
    if (!campoSchema) {
      scartati.push({
        campo: chiave,
        motivo: "Campo non previsto per questa scheda.",
      });
      continue;
    }
    // Празното от модела значи „не го намерих“, не „изтрий стойността“.
    if (valore === null || valore === undefined || valore === "") continue;

    const r = campoSchema.safeParse(valore);
    if (r.success) {
      campi[chiave] = r.data;
      continue;
    }
    scartati.push({
      campo: chiave,
      motivo: r.error.issues[0]?.message ?? "Valore non valido.",
    });
  }

  return { campi, scartati };
}

/**
 * Стойността, както влиза в HTML форма.
 *
 * Zod вече е превърнал датите в `Date`, а формата иска `AAAA-MM-GG`. Без това
 * полето за дата остава празно и извличането изглежда провалено точно там,
 * където най-често е вярно.
 */
export function perForm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

export function campiPerForm(
  campi: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(campi).map(([k, v]) => [k, perForm(v)]),
  );
}
