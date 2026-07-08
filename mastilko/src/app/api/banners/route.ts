import { NextRequest, NextResponse } from "next/server";
import { activeBanners } from "@/lib/banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Публичен, само четене: активните банери за дадено разположение. Без
// бисквитки, без лични данни — само съдържанието, което админът е задал.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") === "home" ? "home" : "all";
  const banners = await activeBanners(p);
  return NextResponse.json(
    { banners },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
