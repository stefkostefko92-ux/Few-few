// JSON, който се вгражда в <script type="application/json">: без <, > и &, за да не може низ от
// данните (име на вид, етикет) да затвори тага или да отвори нов.
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
