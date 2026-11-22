// Транслитерация на кирилица към латиница за URL-приятелски slug-ове.
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const lower = (input ?? "").toLowerCase().trim();
  let out = "";
  for (const ch of lower) {
    if (MAP[ch] !== undefined) out += MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|[-_./]/.test(ch)) out += "-";
    // всичко друго се пропуска
  }
  // Тирето се маха и СЛЕД отрязването до 80 знака — иначе slug-ът може да
  // завърши на „-“ (21.11.2026).
  return (
    out
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-$/, "") || "elem"
  );
}
