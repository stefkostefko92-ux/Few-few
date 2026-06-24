import { NextResponse } from "next/server";
import { streamAnswer, type ChatTurn } from "@/lib/chat";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Изчиства историята, подадена от браузъра, преди да я подадем към модела.
function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw.slice(-16)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role === "user" || role === "bot") && typeof text === "string" && text.trim()) {
      out.push({ role, text: text.slice(0, 1500) });
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    // Ограничава злоупотреба/разход (особено когато е включен платен AI доставчик).
    if (!rateLimit(await clientKey("chat"), 20, 5 * 60 * 1000)) {
      return NextResponse.json(
        {
          answer:
            "Получихме много въпроси от вас за кратко време. Моля, изчакайте малко.",
          sources: [],
        },
        { status: 429 },
      );
    }

    const body = (await req.json()) as { question?: unknown; history?: unknown };
    const question = typeof body.question === "string" ? body.question : "";
    if (question.trim().length < 2) {
      return NextResponse.json(
        { answer: "Моля, напишете по-дълъг въпрос.", sources: [] },
        { status: 400 },
      );
    }
    if (question.length > 500) {
      return NextResponse.json(
        { answer: "Въпросът е твърде дълъг.", sources: [] },
        { status: 400 },
      );
    }
    const history = parseHistory(body.history);

    // Поточен NDJSON отговор: всеки ред е едно събитие ({type:"delta"|...}).
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          for await (const chunk of streamAnswer(question, history)) {
            send(chunk);
          }
        } catch (err) {
          console.error("chat stream error", err);
          send({ type: "error", message: "Възникна грешка. Опитайте отново." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json(
      { answer: "Възникна грешка. Опитайте отново.", sources: [] },
      { status: 500 },
    );
  }
}
