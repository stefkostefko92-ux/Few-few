// Опростен текстов формат за панела: абзаци (празен ред), списъци („- “), **удебелено**, [текст](/път|https://…).
// Всичко се екранира: суров HTML от формата НИКОГА не стига до сайта (спецификация, т. 14).

const MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => MAP[c] ?? c);

/** Позволени адреси: вътрешен път (/…) или https:// — без javascript:, data:, mailto: и т.н. */
export function urlSicuro(u: string): boolean {
  // Вътрешен път: „/…“, но не „//…“ (протокол-относителен адрес към друг сайт).
  return /^\/(?!\/)[A-Za-z0-9\-._~/#?=&%]*$/.test(u) || /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9\-._~/#?=&%;:@+,]*)?$/.test(u);
}

/** Ред текст → HTML (екраниран), с **удебелено** и [връзки](адрес). */
export function mdInline(testo: string): string {
  let out = esc(testo.replace(/\s+/g, " ").trim());
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t: string, u: string) => {
    const url = u.replace(/&amp;/g, "&");
    if (!urlSicuro(url)) return t;
    const ext = url.startsWith("https://");
    return `<a href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`;
  });
  return out;
}

/** Блок текст → абзаци и списъци. Първият абзац може да е директният отговор (.answer, AEO). */
export function mdBlocco(testo: string, { primaRisposta = false } = {}): string {
  const blocchi = testo.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let primo = true;
  return blocchi
    .map((b) => {
      const righe = b.split("\n").map((r) => r.trim());
      if (righe.every((r) => /^[-*] /.test(r))) return `<ul>${righe.map((r) => `<li>${mdInline(r.slice(2))}</li>`).join("")}</ul>`;
      const cls = primo && primaRisposta ? ' class="answer"' : "";
      primo = false;
      return `<p${cls}>${mdInline(righe.join(" "))}</p>`;
    })
    .join("");
}

const DEC: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decodifica = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => DEC[m] ?? m);

function inlineDaHtml(h: string): string {
  return decodifica(
    h
      .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (m, u: string, t: string) => `[${t.replace(/<[^>]+>/g, "")}](${u})`)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** HTML от репото → текстов формат за редакция (само таговете, които сайтът ползва). */
export function htmlToMd(html: string): string {
  const parti: string[] = [];
  const re = /<ul>([\s\S]*?)<\/ul>|<p[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  let trovato = false;
  while ((m = re.exec(html))) {
    trovato = true;
    if (m[1] !== undefined) parti.push([...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((li) => `- ${inlineDaHtml(li[1] ?? "")}`).join("\n"));
    else parti.push(inlineDaHtml(m[2] ?? ""));
  }
  return trovato ? parti.join("\n\n") : inlineDaHtml(html);
}
