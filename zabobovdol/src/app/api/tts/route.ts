import { NextResponse } from "next/server";
import { synthesize, ttsEnabled } from "@/lib/tts";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Връща топъл женски глас (невронен синтез) за прочитане на текста на глас.
// Ако услугата не е настроена — връща 501 и клиентът ползва гласа на браузъра.
export async function POST(req: Request) {
  if (!ttsEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }
  if (!rateLimit(await clientKey("tts"), 30, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text;
  } catch {
    /* празно */
  }
  if (text.trim().length < 2) {
    return NextResponse.json({ error: "no_text" }, { status: 400 });
  }

  const result = await synthesize(text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(new Uint8Array(result.audio), {
    headers: {
      "content-type": result.contentType,
      "cache-control": "no-store",
    },
  });
}
