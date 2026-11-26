// Сглобява целия документ на страница.

import { head } from "./head.mjs";
import { header, footer, breadcrumbs } from "./chrome.mjs";

export function renderPage(page, ctx) {
  return `<!doctype html>
<html lang="it">
${head(page, ctx)}
<body class="${page.bodyClass ?? ""}">
${header({ path: page.path, servizi: ctx.servizi, gruppi: ctx.gruppi, guide: ctx.guide })}
<main id="contenuto" tabindex="-1">
${breadcrumbs(page.breadcrumbs)}
${page.body}
</main>
${footer({ servizi: ctx.servizi, guide: ctx.guide })}
</body>
</html>
`;
}
