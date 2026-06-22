import { NextResponse } from "next/server";
import { z } from "zod";
import { getClient, CHAT_MODEL, SYSTEM_PROMPT } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

const FALLBACK =
  "Чат асистентът не е настроен в момента. Опитайте търсачката горе или вижте „Услуги и телефони“. При спешност се обадете на 112.";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невалидни данни." }, { status: 400 });
  }

  const client = getClient();
  if (!client) {
    return NextResponse.json({ reply: FALLBACK });
  }

  try {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: parsed.data.messages,
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({
      reply: text || "Извинявайте, в момента не мога да отговоря.",
    });
  } catch {
    return NextResponse.json({
      reply:
        "В момента има проблем с асистента. Опитайте по-късно или ползвайте търсачката горе.",
    });
  }
}
