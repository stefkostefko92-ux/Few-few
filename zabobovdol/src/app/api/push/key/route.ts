import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Публичният VAPID ключ (не е тайна). Празно = известията не са настроени.
export async function GET() {
  const key = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  if (!key) return NextResponse.json({ error: "Известията още не са включени." }, { status: 503 });
  return NextResponse.json({ key }, { headers: { "cache-control": "no-store" } });
}
