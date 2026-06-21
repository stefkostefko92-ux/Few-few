/*
 * Двигател за предложения (prediction).
 *
 * ВАЖНО: Тегленията на тото са случайни и независими. Нито един метод не може
 * да предскаже резултата и не повишава реалния шанс за печалба. Този модул
 * подрежда числата по статистически сигнали само за информация и забавление.
 *
 * Подходът: всяко число получава съставен резултат (score) от няколко сигнала,
 * с тегла, които потребителят може да настройва:
 *   - overdue   : колко е „закъсняло" спрямо средното изчакване (gapIndex)
 *   - frequency : историческа честота (freqIndex)
 *   - momentum  : появи в последните N тиража (гореща форма)
 * После се избират най-високо класираните числа.
 */
(function () {
  "use strict";

  const A = window.TotoAnalysis;

  // Изгражда таблица със съставен резултат за всяко число.
  function scoreNumbers(analysis, weights) {
    const w = Object.assign(
      { overdue: 0.5, frequency: 0.25, momentum: 0.25 },
      weights || {}
    );

    // Подготвяме нормализирани вектори за всеки сигнал.
    const pool = analysis.game.pool;
    const gapArr = new Array(pool + 1).fill(0);
    const freqArr = new Array(pool + 1).fill(0);
    const recArr = new Array(pool + 1).fill(0);
    for (const item of analysis.numbers) {
      gapArr[item.n] = item.gap;
      freqArr[item.n] = item.freq;
      recArr[item.n] = item.recent;
    }
    const gapN = A.normalize(gapArr);
    const freqN = A.normalize(freqArr);
    const recN = A.normalize(recArr);

    const total = (w.overdue + w.frequency + w.momentum) || 1;
    const scored = analysis.numbers.map((item) => {
      const score =
        (w.overdue * gapN[item.n] +
          w.frequency * freqN[item.n] +
          w.momentum * recN[item.n]) /
        total;
      return Object.assign({}, item, { score });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  // Връща топ K числа по даден ключ (напр. "gap" за най-закъснелите).
  function topBy(analysis, key, k) {
    return analysis.numbers
      .slice()
      .sort((a, b) => b[key] - a[key])
      .slice(0, k)
      .map((x) => x.n)
      .sort((a, b) => a - b);
  }

  // Балансиран фиш: взима водещите по съставен резултат, но коригира така, че
  // съотношението четни/нечетни и ниски/високи да е близо до историческото
  // средно — както опитните играчи си строят комбинациите.
  function balancedTicket(analysis, weights) {
    const game = analysis.game;
    const k = game.picks;
    const half = game.pool / 2;
    const scored = scoreNumbers(analysis, weights);

    const targetLow = Math.round(analysis.combo.avgLow || k / 2);
    const targetEven = Math.round(analysis.combo.avgEven || k / 2);

    const pick = [];
    let low = 0,
      even = 0;

    function fits(n) {
      const isLow = n <= half;
      const isEven = n % 2 === 0;
      const lowAfter = low + (isLow ? 1 : 0);
      const evenAfter = even + (isEven ? 1 : 0);
      const remaining = k - pick.length - 1;
      // Не позволявай да надхвърлим целите, ако вече сме ги достигнали и има
      // достатъчно други числа да допълнят фиша.
      if (isLow && low >= targetLow && remaining >= targetLow - low) {
        // допуска се леко отклонение, но предпочитаме баланс
      }
      return { isLow, isEven, lowAfter, evenAfter };
    }

    for (const cand of scored) {
      if (pick.length >= k) break;
      const f = fits(cand.n);
      const needMoreLow = low < targetLow;
      const needMoreHigh = pick.length - low < k - targetLow;
      const needMoreEven = even < targetEven;
      const needMoreOdd = pick.length - even < k - targetEven;

      // Меко правило: пропусни числото само ако то влошава вече запълнена квота,
      // а още има нужда от другата страна.
      if (f.isLow && !needMoreLow && needMoreHigh) continue;
      if (!f.isLow && !needMoreHigh && needMoreLow) continue;
      if (f.isEven && !needMoreEven && needMoreOdd) continue;
      if (!f.isEven && !needMoreOdd && needMoreEven) continue;

      pick.push(cand.n);
      if (f.isLow) low += 1;
      if (f.isEven) even += 1;
    }

    // Ако строгите правила са оставили дупки, допълни с водещите оставащи.
    if (pick.length < k) {
      for (const cand of scored) {
        if (pick.length >= k) break;
        if (!pick.includes(cand.n)) pick.push(cand.n);
      }
    }
    return pick.sort((a, b) => a - b);
  }

  // Намира числата, които най-често придружават дадено число (за „около" фиш).
  function companionsOf(analysis, n, count) {
    const game = analysis.game;
    const out = [];
    for (let m = 1; m <= game.pool; m++) {
      if (m === n) continue;
      const key = Math.min(n, m) + "-" + Math.max(n, m);
      out.push({ n: m, c: analysis.pairs.get(key) || 0 });
    }
    out.sort((a, b) => b.c - a.c);
    return out.slice(0, count).map((x) => x.n);
  }

  // Изгражда няколко предложени фиша с различни стратегии.
  function suggestions(analysis, weights) {
    const k = analysis.game.picks;
    const scored = scoreNumbers(analysis, weights);

    const overdue = topBy(analysis, "gap", k);
    const hot = topBy(analysis, "freq", k);
    const model = scored.slice(0, k).map((x) => x.n).sort((a, b) => a - b);
    const balanced = balancedTicket(analysis, weights);

    return {
      scored,
      tickets: [
        {
          id: "overdue",
          name: "Най-закъснели",
          desc: "Числата, които най-дълго не са излизали.",
          numbers: overdue,
        },
        {
          id: "hot",
          name: "Най-чести",
          desc: "Числата с най-висока историческа честота.",
          numbers: hot,
        },
        {
          id: "model",
          name: "Претеглен модел",
          desc: "Комбиниран резултат от закъснение, честота и форма.",
          numbers: model,
        },
        {
          id: "balanced",
          name: "Балансиран фиш",
          desc: "Претегленият модел, изравнен по четни/нечетни и ниски/високи.",
          numbers: balanced,
        },
      ],
    };
  }

  window.TotoPredictor = {
    scoreNumbers,
    topBy,
    balancedTicket,
    companionsOf,
    suggestions,
  };
})();
