/*
 * UI контролер. Свързва данните, анализа и предложенията с интерфейса.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Екранира стойности преди вмъкване през innerHTML (защита срещу DOM-XSS,
  // напр. злонамерена „дата" от импортиран файл).
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const state = {
    gameId: window.TOTO_GAME_ORDER[0],
    draws: [],
    source: "demo",
    analysis: null,
    weights: { overdue: 0.5, frequency: 0.25, momentum: 0.25 },
  };

  function game() {
    return window.TOTO_GAMES[state.gameId];
  }

  // ---- Зареждане ----
  async function loadGame(gameId) {
    state.gameId = gameId;
    const g = game();
    const res = await window.TotoData.ensure(g);
    state.draws = res.draws;
    state.source = res.source;
    recompute();
    renderAll();
  }

  function recompute() {
    state.analysis = window.TotoAnalysis.analyze(state.draws, game(), {
      recentWindow: 20,
    });
  }

  // ---- Рендериране ----
  function renderGameTabs() {
    const nav = $("#gameTabs");
    nav.innerHTML = "";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Избор на игра");
    const ids = window.TOTO_GAME_ORDER;
    const buttons = [];
    ids.forEach((id, i) => {
      const g = window.TOTO_GAMES[id];
      const b = document.createElement("button");
      b.textContent = g.name;
      b.setAttribute("role", "tab");
      const on = id === state.gameId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.addEventListener("click", () => {
        buttons.forEach((x) => {
          const sel = x === b;
          x.classList.toggle("active", sel);
          x.setAttribute("aria-selected", sel ? "true" : "false");
          x.tabIndex = sel ? 0 : -1;
        });
        loadGame(id);
      });
      b.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % ids.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + ids.length) % ids.length;
        if (j !== null) {
          e.preventDefault();
          buttons[j].focus();
          buttons[j].click();
        }
      });
      buttons.push(b);
      nav.appendChild(b);
    });
  }

  function renderStatus() {
    const a = state.analysis;
    const last = state.draws[state.draws.length - 1];
    let srcLabel = "Запазени данни";
    let srcClass = "";
    if (state.source === "demo") {
      srcLabel = 'ДЕМО данни (случайни) — реалният архив още не е зареден';
      srcClass = "badge-demo";
    } else if (state.source === "official") {
      srcLabel = "Архив от публични източници (авто-обновяван)";
      srcClass = "badge-imported";
    } else if (state.source === "seed") {
      srcLabel = "Стартов архив";
    } else if (state.source === "imported") {
      srcLabel = "Импортирани данни (ръчно)";
      srcClass = "badge-imported";
    }
    $("#statusBar").innerHTML = `
      <span class="pill ${srcClass}">${srcLabel}</span>
      <span class="pill">Игра: <strong>${game().name}</strong></span>
      <span class="pill">Тиражи: <strong>${a.drawCount}</strong></span>
      <span class="pill">Последен: <strong>${last && last.date ? esc(last.date) : "—"}</strong></span>
    `;
    $("#expGap").textContent = a.expectedGap.toFixed(1);
  }

  // Топчето е визуално; текстовият смисъл идва от aria-label на контейнера.
  function ball(n) {
    return `<span class="ball" aria-hidden="true">${n}</span>`;
  }

  function renderOverdue() {
    const a = state.analysis;
    const sorted = a.numbers.slice().sort((x, y) => y.gap - x.gap);
    const maxGapSeen = sorted.length ? sorted[0].gap : 1;
    const grid = $("#overdueGrid");
    grid.innerHTML = "";
    sorted.forEach((item, i) => {
      const isOverdue = item.gapIndex >= 1.3; // 30%+ над средното изчакване
      const pct = maxGapSeen ? Math.round((item.gap / maxGapSeen) * 100) : 0;
      const card = document.createElement("div");
      card.className = "num-card" + (isOverdue ? " is-overdue" : "");
      card.setAttribute("role", "group");
      card.setAttribute(
        "aria-label",
        `Число ${item.n}: ${item.gap} тиража без поява (×${item.gapIndex.toFixed(2)} от средното), рекорд ${item.maxGap}`
      );
      card.innerHTML = `
        ${ball(item.n)}
        <div class="gap-num" aria-hidden="true">${item.gap}</div>
        <div class="gap-label" aria-hidden="true">тиража без поява</div>
        <div class="track" aria-hidden="true"><div class="fill" style="width:${pct}%"></div></div>
        <div class="meta" aria-hidden="true">×${item.gapIndex.toFixed(2)} от средното · рекорд: ${item.maxGap}</div>
      `;
      grid.appendChild(card);
    });
  }

  function renderFrequency() {
    const a = state.analysis;
    const sortMode = $("#freqSort").value;
    let nums = a.numbers.slice();
    if (sortMode === "freqDesc") nums.sort((x, y) => y.freq - x.freq);
    else if (sortMode === "freqAsc") nums.sort((x, y) => x.freq - y.freq);
    else nums.sort((x, y) => x.n - y.n);

    const maxFreq = Math.max(1, ...a.numbers.map((x) => x.freq));
    const bars = $("#freqBars");
    bars.innerHTML = "";
    nums.forEach((item) => {
      const pct = Math.round((item.freq / maxFreq) * 100);
      const cls = item.freqIndex >= 1.05 ? "hot" : item.freqIndex <= 0.95 ? "cold" : "";
      // Стрелка, за да не разчитаме само на цвят (WCAG 1.4.1).
      const dir = cls === "hot" ? "▲ " : cls === "cold" ? "▼ " : "";
      const row = document.createElement("div");
      row.className = "bar-row " + cls;
      row.setAttribute("role", "group");
      row.setAttribute(
        "aria-label",
        `Число ${item.n}: изтеглено ${item.freq} пъти, индекс ${item.freqIndex.toFixed(2)}`
      );
      row.innerHTML = `
        <div class="bnum">${item.n}</div>
        <div class="btrack" aria-hidden="true"><div class="bfill" style="width:${pct}%"></div></div>
        <div class="bval">${dir}${item.freq} · ×${item.freqIndex.toFixed(2)}</div>
      `;
      bars.appendChild(row);
    });
  }

  function renderPredict() {
    const a = state.analysis;
    const P = window.TotoPredictor;

    // Вероятностен модел за следващия тираж.
    const probs = P.nextDrawProbabilities(a, state.weights);
    $("#baseProb").textContent = (probs.baseline * 100).toFixed(1) + "%";

    const combo = P.likelyTicket(a, state.weights);
    const comboEl = $("#likelyCombo");
    comboEl.innerHTML = combo.map(ball).join("");
    comboEl.setAttribute("aria-label", "Примерна комбинация: " + combo.join(", "));

    // Честен тест дали данните се отклоняват от равномерни.
    const fair = P.fairnessTest(a);
    const fairEl = $("#fairnessNote");
    if (!fair) {
      fairEl.textContent =
        "Малко данни за статистически тест — заредете повече тиражи за надеждна преценка.";
      fairEl.className = "fairness warn";
    } else if (fair.verdict === "uniform") {
      fairEl.innerHTML =
        `📊 Тестът (χ²=${fair.chi2.toFixed(0)}, df=${fair.df}) показва, че тегленията` +
        ` <strong>не се отклоняват от случайни</strong> — реално всички числа са` +
        ` практически равновероятни. Подредбата по-долу е логична хипотеза, не предимство.`;
      fairEl.className = "fairness ok";
    } else if (fair.verdict === "slight") {
      fairEl.innerHTML =
        `📊 Тестът (χ²=${fair.chi2.toFixed(0)}, df=${fair.df}) показва <strong>леки` +
        ` отклонения</strong> от равномерното. Може да са случайни, но моделът ги отчита.`;
      fairEl.className = "fairness warn";
    } else {
      fairEl.innerHTML =
        `📊 Тестът (χ²=${fair.chi2.toFixed(0)}, df=${fair.df}) показва <strong>значими` +
        ` отклонения</strong> от равномерното разпределение в тези данни.`;
      fairEl.className = "fairness warn";
    }

    // Списък с най-вероятните числа + обосновка.
    const maxProb = Math.max(0.0001, ...probs.items.map((x) => x.prob));
    const top = probs.items.slice(0, 14);
    $("#probList").innerHTML = top
      .map((it) => {
        const pct = Math.round((it.prob / maxProb) * 100);
        return `
        <div class="prob-row" role="group" aria-label="Число ${it.n}: относителна тежест ${(it.prob * 100).toFixed(1)} процента. ${esc(it.reason)}">
          <span class="bnum">${it.n}</span>
          <div class="prob-body">
            <div class="prob-track" aria-hidden="true"><div class="prob-fill" style="width:${pct}%"></div></div>
            <div class="prob-reason">${esc(it.reason)}</div>
          </div>
          <span class="prob-val">${(it.prob * 100).toFixed(1)}%</span>
        </div>`;
      })
      .join("");

    const sug = P.suggestions(a, state.weights);

    const cont = $("#tickets");
    cont.innerHTML = "";
    sug.tickets.forEach((t) => {
      const div = document.createElement("div");
      div.className = "ticket";
      div.innerHTML = `
        <h4>${t.name}</h4>
        <p class="desc">${t.desc}</p>
        <div class="balls" aria-label="Числа: ${t.numbers.join(", ")}">${t.numbers.map(ball).join("")}</div>
      `;
      cont.appendChild(div);
    });

    const maxScore = Math.max(0.0001, ...sug.scored.map((x) => x.score));
    const bars = $("#scoreBars");
    bars.innerHTML = "";
    sug.scored.forEach((item) => {
      const pct = Math.round((item.score / maxScore) * 100);
      const row = document.createElement("div");
      row.className = "bar-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `Число ${item.n}: резултат ${item.score.toFixed(3)}`);
      row.innerHTML = `
        <div class="bnum">${item.n}</div>
        <div class="btrack" aria-hidden="true"><div class="bfill" style="width:${pct}%"></div></div>
        <div class="bval">${item.score.toFixed(3)}</div>
      `;
      bars.appendChild(row);
    });
  }

  function renderStats() {
    const a = state.analysis;
    const c = a.combo;
    const cards = [
      { lbl: "Средна сума на тираж", big: c.avgSum.toFixed(1) },
      { lbl: "Диапазон на сумата", big: `${c.minSum}–${c.maxSum}` },
      { lbl: "Средно четни числа", big: c.avgEven.toFixed(1) + " / " + game().picks },
      { lbl: "Средно ниски (1–" + game().pool / 2 + ")", big: c.avgLow.toFixed(1) + " / " + game().picks },
    ];
    $("#statCards").innerHTML = cards
      .map((x) => `<div class="stat-card"><div class="big">${x.big}</div><div class="lbl">${x.lbl}</div></div>`)
      .join("");

    // Топ двойки
    const pairs = Array.from(a.pairs.entries())
      .sort((x, y) => y[1] - x[1])
      .slice(0, 24);
    $("#pairsList").innerHTML = pairs
      .map(([k, c]) => {
        const [x, y] = k.split("-");
        return `<span class="pair-chip">${x} + ${y} <strong>${c}×</strong></span>`;
      })
      .join("");
  }

  function renderRecent() {
    const recent = state.draws.slice(-8).reverse();
    if (!recent.length) {
      $("#recentDraws").textContent = "";
      return;
    }
    const lines = recent
      .map((d) => `${d.date || "(без дата)"}: ${d.numbers.join(", ")}`)
      .join("  |  ");
    $("#recentDraws").textContent = "Последни тиражи → " + lines;
  }

  // Минимален брой тиражи за смислен статистически анализ.
  const MIN_DRAWS = 25;

  function renderDataNotice() {
    const el = $("#dataNotice");
    const n = state.analysis.drawCount;
    if (state.source === "demo") {
      el.className = "data-notice warn";
      el.innerHTML =
        "🎲 Това са <strong>демонстрационни</strong> (случайни) данни. Реалните " +
        "тегления се зареждат автоматично от публичния архив (таб Данни).";
    } else if (n < MIN_DRAWS) {
      el.className = "data-notice warn";
      el.innerHTML =
        `ℹ️ Засега има само <strong>${n}</strong> ${n === 1 ? "тираж" : "тиража"} реални данни. ` +
        "Архивът се пълни автоматично след всеки тираж — статистиката и " +
        "предложенията стават надеждни при поне " + MIN_DRAWS + " тиража. " +
        'Натисни <button class="link-btn" id="noticeDemo">тук</button>, за да разгледаш как работи с демо данни.';
      const b = el.querySelector("#noticeDemo");
      if (b) b.addEventListener("click", loadDemo);
    } else {
      el.className = "data-notice hidden";
      el.innerHTML = "";
    }
  }

  function loadDemo() {
    state.draws = window.TotoData.generateDemo(game());
    state.source = "demo";
    window.TotoData.save(state.gameId, state.draws);
    window.TotoData.setMeta(state.gameId, { source: "demo" });
    recompute();
    renderAll();
  }

  function renderAll() {
    renderStatus();
    renderDataNotice();
    renderOverdue();
    renderFrequency();
    renderPredict();
    renderStats();
    renderRecent();
  }

  // ---- Събития ----
  // Достъпни табове: aria-selected + roving tabindex + навигация със стрелки
  // (WAI-ARIA Tabs pattern).
  function setupViewTabs() {
    const tabs = $$("#viewTabs button");
    function activate(btn) {
      tabs.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      $$(".view").forEach((v) => v.classList.add("hidden"));
      $("#view-" + btn.dataset.view).classList.remove("hidden");
    }
    tabs.forEach((btn, i) => {
      btn.addEventListener("click", () => activate(btn));
      btn.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j !== null) {
          e.preventDefault();
          activate(tabs[j]);
          tabs[j].focus();
        }
      });
    });
  }

  function setupWeights() {
    const map = [
      ["wOverdue", "overdue"],
      ["wFrequency", "frequency"],
      ["wMomentum", "momentum"],
    ];
    map.forEach(([id, key]) => {
      const el = $("#" + id);
      el.setAttribute("aria-valuetext", el.value + " от 100");
      el.addEventListener("input", () => {
        $("#" + id + "V").textContent = el.value;
        el.setAttribute("aria-valuetext", el.value + " от 100");
        state.weights[key] = Number(el.value) / 100;
        renderPredict();
      });
    });
  }

  function setupFreqSort() {
    $("#freqSort").addEventListener("change", renderFrequency);
  }

  function msg(el, text, ok) {
    el.textContent = text;
    el.className = "msg " + (ok ? "ok" : "err");
  }

  function setupDataActions() {
    $("#btnSync").addEventListener("click", async () => {
      const official = await window.TotoData.fetchOfficial(game());
      if (!official) {
        msg($("#importMsg"), "Официалният архив не е достъпен в момента.", false);
        return;
      }
      state.draws = official;
      state.source = "official";
      window.TotoData.save(state.gameId, state.draws);
      window.TotoData.setMeta(state.gameId, { source: "official" });
      recompute();
      renderAll();
      msg($("#importMsg"), `Заредени ${official.length} тиража от публичния архив.`, true);
    });

    $("#btnExport").addEventListener("click", () => {
      const csv = window.TotoData.toCsv(state.draws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "toto-" + state.gameId + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $("#btnDemo").addEventListener("click", () => {
      if (!confirm("Това ще замени текущите данни с нови случайни демо тиражи. Продължаваме?")) return;
      state.draws = window.TotoData.generateDemo(game());
      state.source = "demo";
      window.TotoData.save(state.gameId, state.draws);
      window.TotoData.setMeta(state.gameId, { source: "demo" });
      recompute();
      renderAll();
    });

    $("#btnClear").addEventListener("click", () => {
      if (!confirm("Сигурен ли си? Това изтрива всички тиражи за тази игра от браузъра.")) return;
      window.TotoData.clear(state.gameId);
      state.draws = window.TotoData.generateDemo(game());
      state.source = "demo";
      window.TotoData.save(state.gameId, state.draws);
      window.TotoData.setMeta(state.gameId, { source: "demo" });
      recompute();
      renderAll();
    });

    $("#btnAddDraw").addEventListener("click", () => {
      const dateVal = $("#addDate").value || null;
      const raw = $("#addNumbers").value.trim();
      const numbers = raw.split(/[,;\t ]+/).filter(Boolean).map((x) => parseInt(x, 10));
      const err = window.TotoData.validateDraw(numbers, game());
      if (err) {
        msg($("#addMsg"), err, false);
        return;
      }
      becomeReal();
      state.draws.push({ date: dateVal, numbers });
      window.TotoData.sortDraws(state.draws);
      // Маркираме източника като ръчен, иначе при следващо зареждане
      // официалният архив ще презапише добавения тираж.
      state.source = "imported";
      window.TotoData.save(state.gameId, state.draws);
      window.TotoData.setMeta(state.gameId, { source: "imported" });
      recompute();
      renderAll();
      $("#addNumbers").value = "";
      msg($("#addMsg"), "Тиражът е добавен.", true);
    });

    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        $("#importText").value = reader.result;
      };
      reader.readAsText(file);
    });

    $("#btnImport").addEventListener("click", () => {
      const text = $("#importText").value;
      const out = window.TotoData.parse(text, game());
      if (!out.draws.length) {
        msg($("#importMsg"), "Не са разпознати валидни тиражи. " + (out.errors[0] || ""), false);
        return;
      }
      becomeReal();
      const replace = $("#importReplace").checked;
      if (replace) {
        state.draws = out.draws;
      } else {
        state.draws = state.draws.concat(out.draws);
        window.TotoData.sortDraws(state.draws);
      }
      window.TotoData.save(state.gameId, state.draws);
      window.TotoData.setMeta(state.gameId, { source: "imported" });
      recompute();
      renderAll();
      const note = out.errors.length ? ` (${out.errors.length} реда пропуснати)` : "";
      msg($("#importMsg"), `Импортирани ${out.draws.length} тиража${note}.`, true);
      $("#importText").value = "";
    });
  }

  // Маркира източника като реален при първото ръчно добавяне/импорт.
  function becomeReal() {
    if (state.source === "demo") {
      state.draws = []; // махаме демо данните при първи реален запис
      state.source = "imported";
      window.TotoData.setMeta(state.gameId, { source: "imported" });
    }
  }

  // ---- Старт ----
  function init() {
    renderGameTabs();
    setupViewTabs();
    setupWeights();
    setupFreqSort();
    setupDataActions();
    loadGame(state.gameId);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
