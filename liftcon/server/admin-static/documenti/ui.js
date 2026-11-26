// Малки помощници за DOM: елементи, полета, сегментирани бутони, известия. Без innerHTML с данни (XSS).

/** h("div.клас", {атрибути, on:{click}}, деца…) */
export function h(tag, attrs = {}, ...figli) {
  const [nome, ...classi] = tag.split(".");
  const el = document.createElement(nome || "div");
  if (classi.length) el.className = classi.join(" ");
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const f of figli.flat(Infinity)) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

let seq = 0;
export const nuovoIdDom = (p = "c") => `${p}-${++seq}`;

/** Текстово поле, свързано с obj[chiave]; onCambio се вика при всяка промяна. */
export function campo(etichetta, obj, chiave, onCambio, o = {}) {
  const id = nuovoIdDom();
  const attr = { id, value: obj[chiave] ?? "", maxlength: o.max ?? 500, placeholder: o.placeholder ?? "", disabled: o.solaLettura, list: o.lista, type: o.tipo ?? "text", inputmode: o.inputmode, autocomplete: o.autocomplete ?? "off" };
  const input = o.area ? h("textarea", { ...attr, rows: o.righe ?? 3 }) : h("input", attr);
  if (o.area) input.value = obj[chiave] ?? "";
  input.addEventListener("input", () => {
    obj[chiave] = input.value;
    onCambio();
  });
  return h("div.cp", {}, h("label", { for: id }, etichetta), input, o.aiuto ? h("p.nota", {}, o.aiuto) : null);
}

export function scelta(etichetta, obj, chiave, opzioni, onCambio, o = {}) {
  const id = nuovoIdDom();
  const sel = h("select", { id, disabled: o.solaLettura }, ...opzioni.map(([v, t]) => h("option", { value: v, selected: obj[chiave] === v }, t)));
  sel.addEventListener("change", () => {
    obj[chiave] = sel.value;
    onCambio(sel.value);
  });
  return h("div.cp", {}, h("label", { for: id }, etichetta), sel);
}

/** Сегментирани бутони (role=radiogroup): за изхода на точка от чеклиста. */
export function segmenti(nome, valore, opzioni, onScelta, solaLettura = false) {
  return h(
    "div.seg",
    { role: "radiogroup", "aria-label": nome },
    ...opzioni.map(([v, t, cls]) =>
      h("button", { type: "button", class: `seg-b ${cls ?? ""} ${valore === v ? "attivo" : ""}`, role: "radio", "aria-checked": String(valore === v), disabled: solaLettura, on: { click: () => onScelta(v) } }, t),
    ),
  );
}

export function avviso(tipo, testo) {
  return h(`p.avviso.avviso-${tipo}`, { role: tipo === "errore" ? "alert" : "status" }, testo);
}

let toastTimer;
export function toast(testo, tipo = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div#toast.toast", { role: "status", "aria-live": "polite" });
    t.id = "toast";
    document.body.append(t);
  }
  t.className = `toast toast-${tipo} visibile`;
  t.textContent = testo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("visibile"), 3500);
}

export const uuid = () => crypto.randomUUID();
export const dataOggi = () => new Date().toISOString().slice(0, 10);
export const oraAdesso = () => new Date().toTimeString().slice(0, 5);
