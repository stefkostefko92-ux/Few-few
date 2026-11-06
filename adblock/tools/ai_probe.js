// Пробата за AI на устройството: има ли Prompt API тук, сваля ли се модела, колко бързо и колко точно
// разпознава спонсорирани текстове на петте езика, които API-то приема. Резултатът е за плана за 6.0.
(() => {
  const $ = (id) => document.getElementById(id);
  const { LANGS, SYSTEM, SCHEMA, parseAnswer, snippet, SAMPLES } = globalThis.SA_AI;
  const OPTS = { expectedInputs: [{ type: "text", languages: LANGS }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

  async function check() {
    if (typeof globalThis.LanguageModel === "undefined") {
      $("avail").textContent = "няма Prompt API в този браузър (нужен е Chrome 138+ на Windows, macOS или Linux)";
      return;
    }
    try {
      const a = await LanguageModel.availability(OPTS);
      const say = { unavailable: "моделът не може да тръгне тук (хардуер, място или език)", downloadable: "моделът може да се свали (първият старт го сваля — около 22 GB свободно място)", downloading: "моделът се сваля", available: "готов" };
      $("avail").textContent = `${a} — ${say[a] || ""}`;
      $("run").disabled = a === "unavailable";
    } catch (e) {
      $("avail").textContent = "грешка: " + e.message;
    }
  }

  async function run() {
    $("run").disabled = true;
    $("rows").textContent = "";
    let session;
    try {
      // Първото create() иска действие на потребителя (бутона) и може да започне свалянето.
      session = await LanguageModel.create({
        ...OPTS,
        initialPrompts: [{ role: "system", content: SYSTEM }],
        monitor(m) { m.addEventListener("downloadprogress", (e) => { $("progress").textContent = `сваляне ${(e.loaded * 100).toFixed(0)} %`; }); },
      });
    } catch (e) {
      $("progress").textContent = "create(): " + e.message;
      $("run").disabled = false;
      return;
    }
    let right = 0, unknown = 0, total = 0;
    for (const s of SAMPLES) {
      const t0 = performance.now();
      let got = null, err = "";
      try { got = parseAnswer(await session.prompt(snippet(s.text), { responseConstraint: SCHEMA })); } catch (e) { err = e.message; }
      const ms = performance.now() - t0;
      total += ms;
      if (got === null) unknown++; else if (got === s.ad) right++;
      const tr = document.createElement("tr");
      for (const v of [s.lang, s.text, s.ad ? "реклама" : "не", err ? "грешка: " + err : got === null ? "неясно" : got ? "реклама" : "не", ms.toFixed(0) + " ms"]) {
        const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
      }
      tr.lastChild.previousSibling.className = got === s.ad ? "ok" : "bad";
      $("rows").appendChild(tr);
    }
    session.destroy();
    $("progress").textContent = "";
    $("summary").textContent = `Вярно: ${right} от ${SAMPLES.length} · неясно: ${unknown} · средно ${(total / SAMPLES.length).toFixed(0)} ms на текст. Прати ми тези числа и версията на Chrome.`;
    $("run").disabled = false;
  }

  $("run").addEventListener("click", run);
  check();
})();
