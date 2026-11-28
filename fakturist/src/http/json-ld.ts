/**
 * JSON за вграждане в `<script type="application/ld+json">`: `<`, `>`, `&` и разделителите на редове се
 * екранират, така че текст от базата не може да затвори скрипта (`</script>`).
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
