// backend/src/services/aiReply.js
// AI auto-reply service for ticket creation.
// Uses the Anthropic Claude API. Requires ANTHROPIC_API_KEY env variable.
// Each Premium server can optionally supply their own key and a custom prompt.

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_PROMPT = `You are a helpful support assistant for a Discord server.
When a new support ticket is created, write a brief, friendly initial response that:
1. Acknowledges the user's request
2. Lets them know a staff member will follow up soon
3. Asks any obvious clarifying questions based on the message
Keep responses under 150 words. Be warm but professional.`;

// Cost control: per-server hourly quota on AI calls. Ticket creation is
// user-triggered, so without a cap a spammer could amplify API spend.
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
 * @param {string|null} options.customApiKey - Server's own Anthropic API key
 * @returns {Promise<string|null>} - The AI reply, or null on failure
 */
export async function generateAutoReply({ userMessage, serverName, customPrompt, customApiKey }) {
  // Determine which API key to use
  const apiKey = customApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // Feature not configured — silent skip

  // Defense in depth: the route also caps this, but never let an oversized
  // stored prompt inflate token spend.
  const systemPrompt = (customPrompt || DEFAULT_PROMPT).slice(0, 2000);

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      system: `${systemPrompt}\n\nYou are responding on behalf of the "${serverName}" server.`,
      messages: [
        {
          role: "user",
          content: userMessage || "(no initial message)",
        },
      ],
    });

    const text = response.content.find((block) => block.type === "text")?.text;
    return text?.trim() || null;
  } catch (err) {
    // Log but never crash ticket creation
    console.error("[AI Reply] Error generating auto-reply:", err.message);
    return null;
  }
}
