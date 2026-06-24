// Сериализира структурирани данни (JSON-LD) безопасно за вграждане в <script>.
// Екранира знаците, с които потребителски текст би могъл да „избяга" от блока
// (вкл. U+2028/U+2029, които са невалидни в някои JSON парсери). Чиста логика —
// за да е тествана отделно от компонента.
const UNSAFE_LDJSON = new RegExp("[<>&\\u2028\\u2029]", "g");

export function safeJsonLd(item: unknown): string {
  return JSON.stringify(item).replace(
    UNSAFE_LDJSON,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
