// Минимален, безопасен Markdown → HTML конвертор без външни зависимости.
// Поддържа: заглавия (##, ###), удебеляване (**), курсив (*), връзки [текст](url),
// списъци (- / 1.), цитати (>) и абзаци. Целият вход се екранира предварително,
// затова не може да се вмъкне произволен HTML (защита от XSS).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Безопасни схеми за връзки. „//host“ и „/\host“ не са вътрешни: браузърът ги
// отваря като външен адрес (протокол-относителен), затова се отхвърлят (21.11.2026).
function safeHref(u: string): string | null {
  // (без trim: LINK вече изключва празните знаци в адреса)
  if (u.startsWith("#")) return u;
  if (u.startsWith("/")) return /^\/[/\\]/.test(u) ? null : u;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  return null;
}

// Адресът позволява едно ниво скоби (`…/wiki/Foo_(bar)`), иначе „)“ остава след текста.
// Несдвоена или двойно вложена скоба не прави връзка — в адреса се пише като %28 / %29.
const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
const SLOT = "\u0000";

function emphasis(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function inline(text: string): string {
  // Входът вече е екраниран веднъж, затова адресът НЕ се екранира втори път
  // (иначе „&“ ставаше „&amp;amp;“ и параметърът се губеше — 21.11.2026).
  // Готовите връзки се пазят в слотове, за да не стигне курсивът до href.
  const links: string[] = [];
  const out = escapeHtml(text.split(SLOT).join("")).replace(LINK, (_m, label: string, url: string) => {
    const href = safeHref(url);
    const attrs = href && /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
    links.push(href ? `<a href="${href}"${attrs}>${emphasis(label)}</a>` : emphasis(label));
    return `${SLOT}${links.length - 1}${SLOT}`;
  });
  return emphasis(out).replace(new RegExp(`${SLOT}(\\d+)${SLOT}`, "g"), (_m, i: string) => links[Number(i)]);
}

export function markdownToHtml(input: string): string {
  const lines = (input ?? "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? "ul" : "ol";
      if (listType && listType !== want) closeList();
      if (!listType) {
        listType = want;
        html.push(`<${want}>`);
      }
      html.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}
