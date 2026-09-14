// backend/src/services/aiReply.js
// AI auto-reply service for ticket creation.
// Uses Google's Gemini API (free tier, Flash model) — owner decision for
// launch; the provider may change later. Requires GEMINI_API_KEY env variable.
// Each Premium server can optionally supply their own key and a custom prompt.
//
// ВАЖНО (поверителност): безплатният tier на Gemini API позволява на Google да
// използва подадено съдържание за подобряване на продуктите си. Това е
// отразено в Privacy Policy §5 — при смяна на плана/доставчика обнови и нея.

const DEFAULT_PROMPT = `You are a helpful support assistant for a Discord server.
When a new support ticket is created, write a brief, friendly initial response that:
1. Acknowledges the user's request
2. Lets them know a staff member will follow up soon
3. Asks any obvious clarifying questions based on the message
Keep responses under 150 words. Be warm but professional.`;

// Публично име на модела за EU AI Act чл. 50 разкритието в бота.
export const AI_MODEL_NAME = "Google Gemini Flash";

// Cost control: per-server hourly quota on AI calls. Ticket creation is
// user-triggered, so without a cap a spammer could amplify API spend (and the
// free tier's daily request quota would drain for every other server).
const AI_CALLS_PER_HOUR = 20;
const aiCallBuckets = new Map(); // serverId → { count, resetAt }

export function aiRateLimitOk(serverId) {
  const now = Date.now();
  const bucket = aiCallBuckets.get(serverId);
  if (!bucket || bucket.resetAt <= now) {
    aiCallBuckets.set(serverId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= AI_CALLS_PER_HOUR) return false;
  bucket.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of aiCallBuckets) if (v.resetAt <= now) aiCallBuckets.delete(k);
}, 60 * 60 * 1000).unref();

/**
 * Generate an AI auto-reply for a newly created ticket.
 *
 * @param {Object} options
 * @param {string} options.userMessage - First message content in the ticket
 * @param {string} options.serverName  - Discord server name (for context)
 * @param {string|null} options.customPrompt - Server-specific system prompt
 * @param {string|null} options.customApiKey - Server's own Gemini API key
 * @returns {Promise<string|null>} - The AI reply, or null on failure
 */
export async function generateAutoReply({ userMessage, serverName, customPrompt, customApiKey }) {
  // Determine which API key to use
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null; // Feature not configured — silent skip

  // Defense in depth: the route also caps this, but never let an oversized
  // stored prompt inflate token spend.
  const systemPrompt = (customPrompt || DEFAULT_PROMPT).slice(0, 2000);

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  // Таймаут: Node-ският `fetch` НЯМА подразбиращ се краен срок. Заявката към
  // Gemini виси в потока на СЪЗДАВАНЕ на тикет — увисне ли доставчикът, увисва
  // и отварянето на тикета. `AbortSignal.timeout` е точното средство; функцията
  // и без това е проектирана да се проваля тихо (връща null), значи прекъснатото
  // повикване просто значи „без AI отговор“.
  const timeoutMs = Number(process.env.AI_REPLY_TIMEOUT_MS || 15_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        // Ключът е в header (не в URL) — да не попада в access логове/proxy-та.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${systemPrompt}\n\nYou are responding on behalf of the "${serverName}" server.` }],
        },
        contents: [
          { role: "user", parts: [{ text: userMessage || "(no initial message)" }] },
        ],
        generationConfig: { maxOutputTokens: 300 },
      }),
    });

    if (!res.ok) {
      // 429 = изчерпан безплатен quota; 4xx/5xx — логваме и пропускаме тихо,
      // тикетът никога не зависи от AI отговора.
      const body = await res.text().catch(() => "");
      console.error(`[AI Reply] Gemini API ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p?.text || "")
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    // Log but never crash ticket creation
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      console.error(`[AI Reply] Gemini не отговори за ${timeoutMs}ms — пропускам`);
    } else {
      console.error("[AI Reply] Error generating auto-reply:", err.message);
    }
    return null;
  }
}
