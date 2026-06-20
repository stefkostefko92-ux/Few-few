import "server-only";

// Топъл, естествен женски глас за четенето на глас — чрез невронен синтез
// (по избор). По подразбиране изключено: ако не са зададени ключове, четенето
// пада към безплатния глас на браузъра. Поддържа Azure Neural TTS (българският
// женски глас „Калина" звучи топло и човешки).

const VOICE = process.env.TTS_VOICE || "bg-BG-KalinaNeural";
const MAX_CHARS = 5000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function ttsEnabled(): boolean {
  return Boolean(
    process.env.TTS_PROVIDER === "azure" &&
      process.env.AZURE_SPEECH_KEY &&
      process.env.AZURE_SPEECH_REGION,
  );
}

export type TtsResult =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string };

export async function synthesize(text: string): Promise<TtsResult> {
  if (!ttsEnabled()) {
    return { ok: false, status: 501, error: "Невронният глас не е настроен." };
  }
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!clean) return { ok: false, status: 400, error: "Няма текст." };

  const region = process.env.AZURE_SPEECH_REGION as string;
  const key = process.env.AZURE_SPEECH_KEY as string;

  // Леко по-бавно темпо и малко по-топъл тон — по-приятно за възрастни.
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xml:lang="bg-BG"><voice name="${VOICE}">` +
    `<prosody rate="-6%" pitch="+2%">${escapeXml(clean)}</prosody>` +
    `</voice></speak>`;

  try {
    const res = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "zabobovdol",
        },
        body: ssml,
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!res.ok) {
      return { ok: false, status: 502, error: `Гласовата услуга върна код ${res.status}.` };
    }
    const audio = await res.arrayBuffer();
    return { ok: true, audio, contentType: "audio/mpeg" };
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : "Грешка при синтез.",
    };
  }
}
