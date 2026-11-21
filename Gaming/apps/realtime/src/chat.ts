import type { Socket } from "socket.io";
import { CHAT_MAX_LEN } from "@aso/shared";

/**
 * In-match chat moderation. Server-authoritative: every line is length-capped
 * (по code point, не по UTF-16 единица), stripped of control and invisible
 * characters, collapsed, and profanity-masked before it is broadcast. A
 * per-socket sliding window throttles spam. Client-side muting of an opponent is
 * layered on top of this for the receiving player.
 */

// Скромен български + английски набор. Съвпадението е по ЦЯЛА дума (Unicode
// граница), с изброени окончания — не по подниз: преди „курорт“ ставаше „к●●орт“,
// „Dickens“ и „педагог“ също. Маскира се вътрешността, думата остава разпознаваема.
const PROFANITY_FORMS = [
  "мамк\\p{L}{0,3}",
  "копел\\p{L}{0,4}",
  "путк\\p{L}{0,3}",
  "кур(?:ът|а|ове|ец|ци)?",
  "курв\\p{L}{0,3}",
  "пед",
  "педер\\p{L}{0,3}",
  "шибан\\p{L}{0,3}",
  "идиот\\p{L}{0,4}",
  "тъп(?:а|и|о|ак|аци|ия|ият)?",
  "fuck(?:s|ed|er|ers|ing|in)?",
  "shit(?:s|ty|head|ting)?",
  "bitch(?:es|y|ing)?",
  "assholes?",
  "cunts?",
  "dick(?:s|head|heads)?",
  "bastards?",
];

const PROFANITY_RE = new RegExp(`^(?:${PROFANITY_FORMS.join("|")})$`, "iu");

/** Дума за проверка: без комбиниращи знаци (fu̶ck) и в малки букви. */
const forCheck = (w: string): string => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const isProfane = (w: string): boolean => PROFANITY_RE.test(forCheck(w));

function mask(word: string): string {
  const cps = Array.from(word);
  if (cps.length <= 2) return "●".repeat(cps.length);
  return cps[0] + "●".repeat(cps.length - 1);
}

/** Най-голяма серия от единични букви, която сгъваме („f u c k“, „к.у.р.в.а“). */
const MAX_SPACED_RUN = 40;
const MIN_SPACED_ROOT = 3;

/** Дума = букви/цифри/комбиниращи знаци; всичко друго е разделител. */
const WORD_RE = /[\p{L}\p{N}\p{M}]+/gu;

interface Tok {
  start: number;
  end: number;
  text: string;
}

/** Маскира цели нецензурни думи и разредени единични букви („f u c k“). */
function maskProfanity(text: string): string {
  const toks: Tok[] = [];
  for (const m of text.matchAll(WORD_RE)) toks.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] });
  // [start,end) диапазони за маскиране; replacement се строи отзад напред.
  const spans: Array<[number, number, string]> = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    if (Array.from(t.text).length === 1 && /\p{L}/u.test(t.text)) {
      // Серия от единични букви, разделени само с разделители (без други думи).
      let j = i;
      while (
        j + 1 < toks.length &&
        j - i < MAX_SPACED_RUN &&
        Array.from(toks[j + 1]!.text).length === 1 &&
        /\p{L}/u.test(toks[j + 1]!.text) &&
        toks[j + 1]!.start - toks[j]!.end <= 2
      ) {
        j++;
      }
      if (j - i + 1 >= MIN_SPACED_ROOT) {
        // Маскираме само ЦЯЛАТА серия: под-серия („к у р“ от „к у р с“) дава фалшиви
        // положителни; „x f u c k“ с чужда буква отпред остава немаскирано (съзнателен компромис).
        const folded = toks
          .slice(i, j + 1)
          .map((x) => x.text)
          .join("");
        if (isProfane(folded)) spans.push([toks[i]!.start, toks[j]!.end, "●".repeat(j - i + 1)]);
      }
      i = j + 1;
      continue;
    }
    if (isProfane(t.text)) spans.push([t.start, t.end, mask(t.text)]);
    i++;
  }
  let out = text;
  for (const [s, e, r] of spans.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + r + out.slice(e);
  return out;
}

/** Невидими форматиращи знаци (zero-width, bidi, soft hyphen, BOM, word joiner…).
 *  Пазим само частите на емоджи последователностите:
 *  - ZWJ между пиктограми, вкл. след модификатор за цвят на кожата (👩🏽‍⚕️) и FE0F;
 *  - таговете U+E0020–E007F, но само в верига след 🏴 (флаговете на Англия/Шотландия/Уелс). */
const INVISIBLE_RE =
  /(?<![\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])\u200D|\u200D(?![\p{Extended_Pictographic}])|(?![\u200D\u{E0020}-\u{E007F}])\p{Cf}|(?<!\u{1F3F4}[\u{E0020}-\u{E007F}]*)[\u{E0020}-\u{E007F}]/gu;

/**
 * Normalize and moderate a raw chat line. Returns the cleaned text, or null if
 * nothing printable remains.
 */
export function sanitizeChat(raw: string): string | null {
  const cleaned = Array.from(
    raw
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ") // strip control chars
      .replace(INVISIBLE_RE, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, CHAT_MAX_LEN) // по code point — не чупи суррогатна двойка
    .join("");
  if (!cleaned) return null;
  return maskProfanity(cleaned);
}

interface ChatRateState {
  times: number[];
}

const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 8; // burst allowance
const MIN_GAP_MS = 500; // anti-flood between consecutive lines

/**
 * Sliding-window rate limit per socket. Mutates state stored on the socket so
 * it lives exactly as long as the connection.
 */
export function chatRateOk(socket: Socket): boolean {
  const data = socket.data as { chat?: ChatRateState };
  data.chat ??= { times: [] };
  const now = Date.now();
  const recent = data.chat.times.filter((t) => now - t < WINDOW_MS);

  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < MIN_GAP_MS) return false;
  if (recent.length >= MAX_IN_WINDOW) return false;

  recent.push(now);
  data.chat.times = recent;
  return true;
}

/**
 * Generic per-socket sliding-window limiter for non-chat events (game actions,
 * queue joins, invites). State lives on the socket, so it's freed on disconnect
 * and is per-connection. Returns false when the caller should drop the event.
 */
export function socketRateOk(socket: Socket, bucket: string, max: number, windowMs: number): boolean {
  const data = socket.data as { rate?: Record<string, number[]> };
  data.rate ??= {};
  const now = Date.now();
  const recent = (data.rate[bucket] ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    data.rate[bucket] = recent;
    return false;
  }
  recent.push(now);
  data.rate[bucket] = recent;
  return true;
}
