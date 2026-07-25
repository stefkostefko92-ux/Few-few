// Разбор на параметрите от URL — на едно място, защото трите списъчни слоя
// (CRUD фабриката, одитът, движенията) го повтаряха дословно.
//
// Освен дублирането има и разлика по същество: сгрешен параметър трябва да даде
// 400 с обяснение, а не 500. `?articoloId=pippo` стигаше до Prisma, той гърмеше
// на невалиден UUID и потребителят получаваше „Errore interno del server" за
// собствената си грешка.

import { ErroreHttp } from "@/lib/auth";

/** Таван на страницата — пази от `?size=100000` като евтин начин да се натовари базата. */
export const SIZE_MAX = 200;
export const SIZE_PREDEFINITO = 50;

export interface Pagina {
  page: number;
  size: number;
  skip: number;
  take: number;
}

/**
 * Страница и размер.
 *
 * Толерантен разбор нарочно: `?page=` (празно) или липсващ параметър са нормални
 * случаи от браузъра, не грешка на потребителя. Отрицателно и нечислово се
 * свеждат до валидната граница, вместо да чупят заявката.
 */
export function paginazione(url: URL): Pagina {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const size = Math.min(
    SIZE_MAX,
    Math.max(1, Number(url.searchParams.get("size") ?? SIZE_PREDEFINITO) || SIZE_PREDEFINITO)
  );
  return { page, size, skip: (page - 1) * size, take: size };
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID параметър — `undefined`, ако липсва; 400, ако е налице, но е сгрешен.
 *
 * Мълчаливото игнориране на сгрешена стойност е по-лошо от грешката: филтърът
 * тихо изчезва и потребителят вижда ЦЕЛИЯ списък, мислейки че е филтриран.
 */
export function uuidParam(url: URL, nome: string): string | undefined {
  const v = url.searchParams.get(nome);
  if (v === null || v === "") return undefined;
  if (!RE_UUID.test(v)) throw new ErroreHttp(400, `Parametro «${nome}» non valido`);
  return v;
}

/** Текст за търсене — подрязан, празният низ се брои за липсващ. */
export function testoParam(url: URL, nome = "q"): string | undefined {
  const v = url.searchParams.get(nome)?.trim();
  return v ? v : undefined;
}

/**
 * Параметър от затворен списък — 400 при стойност извън него.
 *
 * Използва се за `?stato=`, `?azione=` и подобни: без проверката произволен низ
 * стига до базата, връща празен резултат и изглежда като „няма данни".
 */
export function enumParam<T extends string>(
  url: URL,
  nome: string,
  ammessi: readonly T[]
): T | undefined {
  const v = url.searchParams.get(nome)?.trim();
  if (!v) return undefined;
  if (!(ammessi as readonly string[]).includes(v))
    throw new ErroreHttp(400, `Parametro «${nome}» non valido`);
  return v as T;
}

/** Тристойностен булев параметър: `true` / `false` / липсва. */
export function booleanoParam(url: URL, nome: string): boolean | undefined {
  const v = url.searchParams.get(nome);
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
