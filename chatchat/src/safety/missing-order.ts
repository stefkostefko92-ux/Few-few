import type { DiagnosticAnswer } from '../domain/response.js';

/**
 * Редът на липсващите данни (FR-07 „domande dinamiche … in ordine di valore diagnostico“) —
 * детерминистичен, на сървъра, след модела. §10.3: „първо данните, които елиминират най-много
 * хипотези с най-малко оперативна цена“; §12.1: таблото се избира със сканиране на QR, а
 * модел/HW/FW/сериен номер са винаги видими. Затова:
 *   0 сериен номер / QR  — едно сканиране дава модел, HW, FW и опциите от регистъра и отключва
 *                          уникалните схеми на таблото (`kb.boardSerialRequired`) — най-много
 *                          отговори за едно действие;
 *   1 фърмуер            — един код значи различно в различен FW (§16.3 „същото име, друга
 *                          версия“), приложимостта на документите е главно по обхват на FW (§8.2);
 *   2 HW ревизия         — стеснява правилата по ревизия; по-рядко решаваща от FW; тук е и
 *                          опция на таблото, поискана от документ (FR-01) — конфигурация като HW;
 *   3 код за грешка      — точният път (§8.3 „exact code + correct version“ → водена диагноза), но
 *                          смислен чак когато версията е известна; тук са и непознат/различен код
 *                          от въпроса или от снимката (потвърждение);
 *   4 снимка на дисплея  — допълващо доказателство (§9.2): не вдига нивото, иска анализ;
 *   5 лог на събитията   — допълващо, по-скъпо за сваляне от таблото;
 *   6 извършени проверки — описание на ръка: най-скъпо за техника, най-малко отсява на усилие,
 *                          но нужно за тикета (§10.2 „Escalation“);
 *   7 останалото         — свободният текст на модела (стойността му не се знае предварително);
 *   8 обяснения gate.*   — не са данни за събиране.
 * При равен ранг редът на появяване се пази (стабилно сортиране).
 */

const RANK: ReadonlyArray<readonly [number, RegExp]> = [
  [0, /^(ctx|collect)\.serial$/],
  [1, /^(ctx|collect)\.firmware$/],
  [2, /^((ctx|collect)\.hardwareRevision|ctx\.option:.+)$/],
  [3, /^(ctx\.(unknownIdentifier|photoCodeMismatch|photoCode):.+|collect\.errorCode)$/],
  [4, /^collect\.(displayPhoto|betterPhoto|photoFormat|photoSize)$/],
  [5, /^collect\.(eventLog|logExcerpt)$/],
  [6, /^collect\.checksDone$/],
  [8, /^gate\./],
];

/** Рангът на една липсваща данна (по-малкото е по-напред). */
export function missingRank(item: string): number {
  for (const [rank, re] of RANK) if (re.test(item)) return rank;
  return 7;
}

/** Подрежда по диагностична стойност, без повторения; при равен ранг — редът на появяване. */
export function orderMissing(items: readonly string[]): string[] {
  return [...new Set(items)]
    .map((item, i) => ({ item, i, rank: missingRank(item) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.item);
}

/** Последната стъпка на всеки отговор (с модел и без): `missingData` и `collect` в реда по-горе. */
export function withOrderedMissing(answer: DiagnosticAnswer): DiagnosticAnswer {
  return {
    ...answer,
    missingData: orderMissing(answer.missingData),
    escalation: { ...answer.escalation, collect: orderMissing(answer.escalation.collect) },
  };
}
