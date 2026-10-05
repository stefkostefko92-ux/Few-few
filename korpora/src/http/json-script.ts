/**
 * JSON за вграждане в `<script type="application/json">` и `<script type="application/ld+json">`.
 * `<` се екранира, иначе `</script>` в име на проект или в превод би затворил блока; U+2028/U+2029 —
 * за да е текстът валиден и като JavaScript низ. Едно правило за всички страници.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
