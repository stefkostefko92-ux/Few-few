// Минимален, безопасен Markdown → HTML рендер. Съдържанието е от доверени
// автори (админ/редактор), но въпреки това екранираме HTML, за да няма XSS.
// Поддържа: заглавия (#, ##, ###), удебелен (**), курсив (*), връзки,
// списъци (-, 1.), цитати (>) и параграфи.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  let t = escapeHtml(text);
  // връзки [текст](url) — допускаме само http(s), mailto и tel
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g,
    (_m, label, url) =>
      `<a href="${url}" rel="noopener noreferrer"${
        url.startsWith("http") ? ' target="_blank"' : ""
      }>${label}</a>`,
  );
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return t;
}

export function renderMarkdown(src: string): string {
  if (!src) return "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
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
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph();
      closeList();
      const level = h[1].length + 1; // # -> h2 (h1 е заглавието на страницата)
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        listType = want;
        html.push(`<${want}>`);
      }
      html.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return html.join("\n");
}

// Кратко резюме без Markdown — за meta описания и листинги.
export function plainText(src: string, max = 160): string {
  const t = (src ?? "")
    .replace(/[#*>_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}
