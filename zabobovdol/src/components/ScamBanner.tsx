import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";

// Показва закачено предупреждение за измама като видна лента (ако има активно).
export async function ScamBanner() {
  let alert: { title: string; summary: string } | null = null;
  try {
    alert = await prisma.scamAlert.findFirst({
      where: { published: true, pinned: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: { title: true, summary: true },
    });
  } catch {
    alert = null;
  }
  if (!alert) return null;

  return (
    <Link
      href="/izmami"
      className="block border-b border-crimson-700 bg-crimson-600 text-white transition hover:bg-crimson-700"
    >
      <div className="container-content flex items-center gap-3 py-2.5 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <strong className="font-bold">Внимание, измама: </strong>
          {alert.title}
          {alert.summary ? ` — ${alert.summary}` : ""}
          <span className="ml-1 whitespace-nowrap font-semibold underline">
            Виж как да се пазите →
          </span>
        </span>
      </div>
    </Link>
  );
}
