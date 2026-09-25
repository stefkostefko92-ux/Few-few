// Кой може да вижда прикачените файлове — СПОРЕД модула, към който са закачени.
//
// Прикаченият файл наследява поверителността на записа си. Досега списъкът,
// свалянето и качването искаха OPERATORE/TECNICO за всичко, а модулът за
// фактури е DIREZIONE+: OPERATORE вземаше id-тата на фактурите от договора и
// сваляше прикачените им файлове — тоест заобикаляше собствения модул.

import { haPermesso, type Ruolo } from "@/lib/roles";

/** Минималната роля за ЧЕТЕНЕ на файловете на даден модул. */
const MINIMO_LETTURA: Record<string, Ruolo> = {
  fatture: "DIREZIONE",
};

/** Минималната роля за КАЧВАНЕ/ИЗТРИВАНЕ — никога по-ниска от четенето. */
const MINIMO_SCRITTURA: Record<string, Ruolo> = {
  fatture: "DIREZIONE",
};

/**
 * По-строгото от двете изисквания — ролята с ПОВЕЧЕ права (по-малко число).
 * `haPermesso(a, b)` е вярно, когато `a` има поне правата на `b`: тогава `a` е
 * по-високото изискване. (Първата версия връщаше обратното и пускаше TECNICO
 * да качва във фактура — тестът го хвана.)
 */
function piuStretto(a: Ruolo, b: Ruolo): Ruolo {
  return haPermesso(a, b) ? a : b;
}

export function puoLeggereAllegati(ruolo: Ruolo, entita: string): boolean {
  const minimo = MINIMO_LETTURA[entita];
  return !minimo || haPermesso(ruolo, minimo);
}

export function puoScrivereAllegati(
  ruolo: Ruolo,
  entita: string,
  base: Ruolo,
): boolean {
  const minimo = MINIMO_SCRITTURA[entita];
  return haPermesso(ruolo, minimo ? piuStretto(base, minimo) : base);
}
