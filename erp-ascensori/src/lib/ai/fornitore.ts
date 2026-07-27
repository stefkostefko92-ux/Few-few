// Тънък слой към доставчика на модела.
//
// Единственото, което прави: „ето указание, ето документ — върни JSON“. Знае за
// три доставчика, защото форматът на заявката им се различава, и НЕ знае нищо
// за асансьори, фактури или Zod. Така смяната на доставчик не пипа фискалната
// логика, а фискалната логика се тества без мрежа.

import { configAi, type ConfigAi } from "@/lib/ai/config";

export interface RichiestaAi {
  /** Указанието — НАШЕ. Никога не идва от потребител. */
  istruzione: string;
  /**
   * Документът: байтове + подушен тип.
   *
   * НЕЗАДЪЛЖИТЕЛЕН. Извличането на полета чете документ; съставянето на текст
   * (описание на оферта, обобщение на поръчка) няма какво да чете — там
   * входът е бележката на оператора и тя вече е в указанието.
   */
  documento?: { dati: Uint8Array; mimeType: string };
  /**
   * Какъв изход чакаме.
   *
   * ЗАЩО Е ИЗРИЧНО. И трите доставчика имат ключ „върни само JSON“
   * (`responseMimeType`, `response_format`). Пуснат при задача за проза, той
   * дава `{"testo": "…"}` в най-добрия случай и отказ в най-лошия — тоест
   * забравеният превключвател е повреда, която изглежда като грешка на модела.
   */
  formato?: "json" | "testo";
  /** Таван на изхода. JSON с трийсетина полета се побира с голям запас. */
  maxToken?: number;
}

export class ErroreAi extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

/** Таймаут: сканиран PDF отнема секунди, но не бива да държи заявката вечно. */
const TIMEOUT_MS = 45_000;

function base64(dati: Uint8Array): string {
  return Buffer.from(dati).toString("base64");
}

async function leggiJson(res: Response): Promise<unknown> {
  const testo = await res.text();
  try {
    return JSON.parse(testo);
  } catch {
    throw new ErroreAi(
      502,
      "Il servizio AI ha risposto in un formato inatteso.",
    );
  }
}

/**
 * Превежда грешката на доставчика на нещо, което операторът може да ползва.
 *
 * Суровият текст от доставчика НЕ се показва: той е на английски, издава
 * вътрешни подробности и понякога съдържа част от подадените данни.
 */
function traduciErrore(stato: number): ErroreAi {
  if (stato === 401 || stato === 403)
    return new ErroreAi(
      503,
      "Chiave del servizio AI non valida: verificare la configurazione.",
    );
  if (stato === 429)
    return new ErroreAi(
      429,
      "Quota del servizio AI esaurita: riprovare più tardi.",
    );
  if (stato === 413)
    return new ErroreAi(413, "Documento troppo grande per il servizio AI.");
  return new ErroreAi(502, "Il servizio AI non ha risposto: riprovare.");
}

/** JSON ли чакаме. Подразбирането е „да“ — старият път остава непокътнат. */
function vuoleJson(r: RichiestaAi): boolean {
  return (r.formato ?? "json") === "json";
}

async function chiediGemini(c: ConfigAi, r: RichiestaAi): Promise<string> {
  const parti: Record<string, unknown>[] = [{ text: r.istruzione }];
  if (r.documento)
    parti.push({
      inlineData: {
        mimeType: r.documento.mimeType,
        data: base64(r.documento.dati),
      },
    });
  const res = await fetch(
    `${c.baseUrl}/models/${encodeURIComponent(c.modello)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": c.chiave,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: parti }],
        generationConfig: {
          // Извличане на данни, не съчинение: температурата е нула, за да не
          // „допълва“ полета, които в документа ги няма. За текст я вдигаме
          // едва до 0,3 — достатъчно за четимо изречение, недостатъчно, за да
          // започне да съчинява технически подробности.
          temperature: vuoleJson(r) ? 0 : 0.3,
          maxOutputTokens: r.maxToken ?? 2048,
          ...(vuoleJson(r) ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw traduciErrore(res.status);
  const d = (await leggiJson(res)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  );
}

async function chiediAnthropic(c: ConfigAi, r: RichiestaAi): Promise<string> {
  // PDF-ът и картинката вървят по различни пътища в този формат.
  const doc = r.documento;
  const contenuto = !doc
    ? null
    : doc.mimeType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64(doc.dati),
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64",
            media_type: doc.mimeType,
            data: base64(doc.dati),
          },
        };

  const res = await fetch(`${c.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": c.chiave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: c.modello,
      max_tokens: r.maxToken ?? 2048,
      temperature: vuoleJson(r) ? 0 : 0.3,
      messages: [
        {
          role: "user",
          content: [
            ...(contenuto ? [contenuto] : []),
            { type: "text", text: r.istruzione },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw traduciErrore(res.status);
  const d = (await leggiJson(res)) as {
    content?: { type: string; text?: string }[];
  };
  return (d.content ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

async function chiediOpenAi(c: ConfigAi, r: RichiestaAi): Promise<string> {
  const doc = r.documento;
  const dataUrl = doc ? `data:${doc.mimeType};base64,${base64(doc.dati)}` : "";
  const contenuto: Record<string, unknown>[] = [
    { type: "text", text: r.istruzione },
  ];
  if (doc)
    contenuto.push(
      doc.mimeType === "application/pdf"
        ? {
            type: "file",
            file: { filename: "documento.pdf", file_data: dataUrl },
          }
        : { type: "image_url", image_url: { url: dataUrl } },
    );
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.chiave}`,
    },
    body: JSON.stringify({
      model: c.modello,
      temperature: vuoleJson(r) ? 0 : 0.3,
      max_tokens: r.maxToken ?? 2048,
      ...(vuoleJson(r) ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "user", content: contenuto }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw traduciErrore(res.status);
  const d = (await leggiJson(res)) as {
    choices?: { message?: { content?: string } }[];
  };
  return d.choices?.[0]?.message?.content ?? "";
}

/** Пита модела и връща СУРОВИЯ текст. Разборът и проверката са другаде. */
export async function chiedi(r: RichiestaAi): Promise<string> {
  const c = configAi();
  if (c.effettivo === "off")
    throw new ErroreAi(503, "Servizio AI non configurato.");
  try {
    if (c.effettivo === "gemini") return await chiediGemini(c, r);
    if (c.effettivo === "anthropic") return await chiediAnthropic(c, r);
    return await chiediOpenAi(c, r);
  } catch (e) {
    if (e instanceof ErroreAi) throw e;
    // Таймаут и мрежова грешка изглеждат еднакво отвън и се обясняват еднакво.
    throw new ErroreAi(
      504,
      "Il servizio AI non ha risposto in tempo: riprovare.",
    );
  }
}

/**
 * Изкопава JSON от отговора.
 *
 * Моделите обичат да обвиват изхода в ```json … ``` или да добавят изречение
 * преди него, въпреки изричното указание. По-евтино е да го изчистим тук,
 * отколкото да откажем валиден отговор заради три обратни апострофа.
 */
export function estraiJson(testo: string): unknown {
  const pulito = testo
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(pulito);
  } catch {
    // Втори опит: първият блок { … } в текста.
    const inizio = pulito.indexOf("{");
    const fine = pulito.lastIndexOf("}");
    if (inizio < 0 || fine <= inizio) return null;
    try {
      return JSON.parse(pulito.slice(inizio, fine + 1));
    } catch {
      return null;
    }
  }
}
