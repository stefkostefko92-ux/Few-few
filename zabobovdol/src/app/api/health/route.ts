import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Проверка на живо за мониторинг и за health гейта при деплой: потвърждава,
// че приложението И базата отговарят (не само че процесът е жив).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "database unreachable" },
      { status: 503 },
    );
  }
}
