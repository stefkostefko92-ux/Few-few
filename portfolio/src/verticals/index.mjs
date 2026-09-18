// verticals/index.mjs — страниците „Изработка на сайт за <бизнес>“: една на демо, ×3 езика. Уникалният текст
// е в bg/en/it.mjs (ключ = id на демото); общите части идват от i18n.vertical; числата — от pricing.mjs.
// Пътят е /<lang>/<base>/<slug на демото>/ — слъгът е същият като на демото, само базата е различна.
import bg from "./bg.mjs";
import en from "./en.mjs";
import it from "./it.mjs";
import { DEMOS } from "../demos/index.mjs";
import { PATHS } from "../lib/html.mjs";

export const VERTICALS = { bg, en, it };
export const verticalPath = (lang, demo) => `${PATHS.vertical[lang]}${demo.slug[lang]}/`;
export const verticalPaths = (demo) => Object.fromEntries(["bg", "en", "it"].map((l) => [l, verticalPath(l, demo)]));

// Всяко демо има вертикала на всеки език — гейтнато и тук (билдът пада шумно, не тихо пропуска страница).
for (const d of DEMOS) for (const l of ["bg", "en", "it"]) {
  const v = VERTICALS[l][d.id];
  if (!v || !v.h1 || !v.title || !v.desc || v.intro?.length !== 2 || v.faq?.length !== 3) throw new Error(`verticals/${l}.mjs: липсва или е непълен запис за „${d.id}“`);
}
