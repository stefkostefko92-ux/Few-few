import "server-only";

import { cookies } from "next/headers";

import { readToken, type SessionClaims } from "./session";

/**
 * Кой работи и по коя преписка.
 *
 * Обосновката е задължително поле на всеки одиторски запис за справка
 * (чл. 25 от Директива (ЕС) 2016/680). Затова тя не се пита СЛЕД търсенето, а
 * се задава веднъж за работната сесия: справка без основание просто не тръгва.
 *
 * Преписката живее в отделна бисквитка, не в жетона: тя се сменя по няколко
 * пъти на ден, а самоличността — не. Не се подписва, защото не дава права —
 * подправянето ѝ би заблудило само собствения запис на служителя, а неговата
 * самоличност идва от подписания жетон и остава вярна.
 */

export const SESSION_COOKIE = "carbonip_session";
export const CASE_COOKIE = "carbonip_case";

export interface CaseContext {
  session: SessionClaims;
  /** Номер на преписка + правно основание, както са въведени. */
  justification: string;
}

export async function readSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return readToken(jar.get(SESSION_COOKIE)?.value, process.env.IPLOOKUP_SESSION_SECRET ?? "");
}

export async function readCaseContext(): Promise<CaseContext | null> {
  const session = await readSession();
  if (!session) return null;
  const jar = await cookies();
  const justification = jar.get(CASE_COOKIE)?.value?.trim();
  return justification ? { session, justification } : null;
}
