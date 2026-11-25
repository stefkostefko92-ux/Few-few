import { NextResponse } from "next/server";
import { search, recordMiss } from "@/lib/search";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Ограничава злоупотреба (вкл. наводняване на „търсения без резултат").
  if (!rateLimit(await clientKey("search"), 60, 5 * 60 * 1000)) {
    return NextResponse.json({ results: [] }, { status: 429 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  // search() брои търсенето и сам записва слабите резултати; нулевите — тук.
  // Текстът се маскира (ЕГН, телефони, имейли…) преди запис — виж recordMiss.
  const results = await search(q, 15, { source: "api" });
  if (results.length === 0) await recordMiss(q, "api");
  return NextResponse.json({ results });
}
