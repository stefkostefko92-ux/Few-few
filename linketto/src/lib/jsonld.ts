// Сериализира структурирани данни (JSON-LD) безопасно за вграждане в <script>.
// `JSON.stringify` НЕ екранира `<`, затова потребителски текст (displayName, bio,
// заглавие на продукт) може да затвори блока с `</script>` и да инжектира скрипт —
// на публичните /u/[slug] и /d/[domain], където linketto няма CSP.
// Екранира и U+2028/U+2029 (невалидни в някои JSON парсери).
// Огледало на `zabobovdol/src/lib/jsonld.ts` — чиста логика, за да е тествана отделно.
const UNSAFE_LDJSON = new RegExp("[<>&\\u2028\\u2029]", "g");

export function safeJsonLd(item: unknown): string {
  return JSON.stringify(item).replace(
    UNSAFE_LDJSON,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
