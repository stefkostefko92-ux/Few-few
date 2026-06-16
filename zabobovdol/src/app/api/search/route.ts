import { NextResponse } from "next/server";
import { search, recordMiss } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const results = await search(q, 15);
  if (results.length === 0) await recordMiss(q);
  return NextResponse.json({ results });
}
