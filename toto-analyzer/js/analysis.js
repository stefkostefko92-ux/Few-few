/*
 * Аналитичен двигател.
 *
 * Всички функции тук са чисти (pure) — приемат масив от тегления и връщат
 * статистика. Едно „тегление" е обект: { date: "ГГГГ-ММ-ДД", numbers: [n1, n2, ...] }.
 * Масивът от тегления се очаква подреден от НАЙ-СТАРОТО към НАЙ-НОВОТО.
 *
 * Терминология:
 *   pool   — колко числа има в коша (напр. 35)
 *   picks  — колко числа се теглят на тираж (напр. 5)
 *   gap    — на колко тиража назад е било последно изтеглено дадено число
 *            (0 = в последния тираж, 1 = в предпоследния и т.н.)
 */
(function () {
  "use strict";

  // Очаквана честота на поява на едно число в един тираж = picks / pool.
  // Очакваното изчакване между две появи (среден gap) ≈ pool / picks.
  function expectedGap(game) {
    return game.pool / game.picks;
  }

  // Брой пъти, в които всяко число е било изтеглено.
  function frequency(draws, game) {
    const counts = new Array(game.pool + 1).fill(0);
    for (const d of draws) {
      for (const n of d.numbers) {
        if (n >= 1 && n <= game.pool) counts[n] += 1;
      }
    }
    return counts; // индекс 0 не се ползва
  }

  // За всяко число: на колко тиража назад е било последно изтеглено.
  // Ако никога не е излизало → gap = общия брой тиражи (т.е. „максимално закъсняло").
  function gaps(draws, game) {
    const total = draws.length;
    const gap = new Array(game.pool + 1).fill(total);
    // Обхождаме от най-новия към най-стария тираж.
    for (let i = 0; i < total; i++) {
      const draw = draws[total - 1 - i]; // i = 0 → най-новият
      for (const n of draw.numbers) {
        if (n >= 1 && n <= game.pool && gap[n] === total) {
          gap[n] = i;
        }
      }
    }
    return gap;
  }

  // За всяко число: най-дългата серия от поредни тиражи без него (исторически рекорд).
  function maxGaps(draws, game) {
    const total = draws.length;
    const max = new Array(game.pool + 1).fill(0);
    const since = new Array(game.pool + 1).fill(0); // тиражи от последна поява
    for (let i = 0; i < total; i++) {
      const present = new Set(draws[i].numbers);
      for (let n = 1; n <= game.pool; n++) {
        if (present.has(n)) {
          since[n] = 0;
        } else {
          since[n] += 1;
          if (since[n] > max[n]) max[n] = since[n];
        }
      }
    }
    return max;
  }

  // Появи в последните W тиража (мярка за „инерция"/гореща форма).
  function recent(draws, game, window) {
    const counts = new Array(game.pool + 1).fill(0);
    const slice = draws.slice(Math.max(0, draws.length - window));
    for (const d of slice) {
      for (const n of d.numbers) {
        if (n >= 1 && n <= game.pool) counts[n] += 1;
      }
    }
    return counts;
  }

  // Двойки числа, които често излизат заедно (companion анализ).
  // Връща Map: "a-b" -> брой съвместни появи (a < b).
  function pairCounts(draws, game) {
    const map = new Map();
    for (const d of draws) {
      const nums = d.numbers
        .filter((n) => n >= 1 && n <= game.pool)
        .sort((a, b) => a - b);
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const key = nums[i] + "-" + nums[j];
          map.set(key, (map.get(key) || 0) + 1);
        }
      }
    }
    return map;
  }

  // Описателна статистика за изтеглените комбинации:
  // средна сума, дял четни, дял ниски (долната половина на коша).
  function combinationStats(draws, game) {
    if (draws.length === 0) {
      return { avgSum: 0, minSum: 0, maxSum: 0, avgEven: 0, avgLow: 0 };
    }
    const half = game.pool / 2;
    let sumTotal = 0,
      evenTotal = 0,
      lowTotal = 0;
    let minSum = Infinity,
      maxSum = -Infinity;
    for (const d of draws) {
      const s = d.numbers.reduce((a, b) => a + b, 0);
      sumTotal += s;
      if (s < minSum) minSum = s;
      if (s > maxSum) maxSum = s;
      evenTotal += d.numbers.filter((n) => n % 2 === 0).length;
      lowTotal += d.numbers.filter((n) => n <= half).length;
    }
    return {
      avgSum: sumTotal / draws.length,
      minSum,
      maxSum,
      avgEven: evenTotal / draws.length,
      avgLow: lowTotal / draws.length,
    };
  }

  // Нормализира масив към [0, 1] (без индекс 0).
  function normalize(arr) {
    let min = Infinity,
      max = -Infinity;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    const range = max - min || 1;
    const out = new Array(arr.length).fill(0);
    for (let i = 1; i < arr.length; i++) {
      out[i] = (arr[i] - min) / range;
    }
    return out;
  }

  // Цялостен анализ — събира всичко на едно място за UI слоя.
  function analyze(draws, game, opts) {
    opts = opts || {};
    const recentWindow = opts.recentWindow || 20;
    const freq = frequency(draws, game);
    const gap = gaps(draws, game);
    const maxGap = maxGaps(draws, game);
    const rec = recent(draws, game, recentWindow);
    const exp = expectedGap(game);
    const expFreq = draws.length > 0 ? (game.picks * draws.length) / game.pool : 0;

    const numbers = [];
    for (let n = 1; n <= game.pool; n++) {
      numbers.push({
        n,
        freq: freq[n],
        // Индекс спрямо очакваното: 1.0 = точно колкото се очаква.
        freqIndex: expFreq > 0 ? freq[n] / expFreq : 0,
        gap: gap[n],
        // >1 означава „закъсняло" спрямо средното изчакване.
        gapIndex: exp > 0 ? gap[n] / exp : 0,
        maxGap: maxGap[n],
        recent: rec[n],
      });
    }

    return {
      game,
      drawCount: draws.length,
      expectedGap: exp,
      expectedFreq: expFreq,
      recentWindow,
      numbers,
      pairs: pairCounts(draws, game),
      combo: combinationStats(draws, game),
    };
  }

  window.TotoAnalysis = {
    expectedGap,
    frequency,
    gaps,
    maxGaps,
    recent,
    pairCounts,
    combinationStats,
    normalize,
    analyze,
  };
})();
