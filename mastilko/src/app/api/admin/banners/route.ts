import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BannerSchema, readBanners, writeBanners } from "@/lib/banners";

export const runtime = "nodejs";

// Защитен от middleware. Управлява целия списък банери (прочети / запиши).

export async function GET() {
  return NextResponse.json({ banners: await readBanners() });
}

const SaveSchema = z.object({ banners: z.array(BannerSchema).max(50) });

export async function PUT(req: NextRequest) {
  let body: z.infer<typeof SaveSchema>;
  try {
    body = SaveSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Невалидни данни." }, { status: 400 });
  }
  // Пренормализираме реда, за да е стабилен.
  const list = body.banners.map((b, i) => ({ ...b, order: i }));
  await writeBanners(list);
  return NextResponse.json({ ok: true, banners: list });
}
