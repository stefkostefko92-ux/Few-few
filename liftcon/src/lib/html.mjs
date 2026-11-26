// Малки помощници за генерирането на HTML. Съдържанието е авторско (не идва от потребители), но всичко,
// което влиза в атрибут или е обикновен текст, минава през esc() — грешка в данните не чупи страницата.

const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Екранира текст за HTML съдържание и атрибути. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => MAP[c]);
}

/** Сглобява масив от HTML фрагменти. */
export function join(items, fn, sep = "") {
  return (items ?? []).map(fn).join(sep);
}

/** Абсолютен URL от път на сайта. */
export function abs(base, path) {
  return base + (path.startsWith("/") ? path : `/${path}`);
}

/** Текст без тагове (за JSON-LD и брояч на думи). */
export function plain(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** JSON за <script type="application/ld+json">: `<` се екранира, за да не затвори тага. */
export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Списък с отметки (ul.check). */
export function checkList(items, cls = "check") {
  return `<ul class="${cls}">${join(items, (i) => `<li>${i}</li>`)}</ul>`;
}
