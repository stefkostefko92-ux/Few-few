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

// Безопасни схеми за връзки.
function safeHref(url: string): string | null {
  const u = url.trim();
  if (u.startsWith("/") || u.startsWith("#")) return u;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  return null;
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // Връзки [текст](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      const href = safeHref(url);
      if (!href) return label;
      const ext = /^https?:/i.test(href);
      const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${escapeHtml(href)}"${attrs}>${label}</a>`;
    },
  );
  // Удебеляване и курсив
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
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
