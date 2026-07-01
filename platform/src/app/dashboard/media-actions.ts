"use server";

import { unlink } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadDir, isSafeStoredName } from "@/lib/uploads";

export type MediaItem = { url: string; kind: string; createdAt: string };

// Списък с качените изображения (за преизползване). Собственикът вижда всички,
// членовете — своите. Най-новите първи.
export async function listUploadsAction(): Promise<MediaItem[]> {
  const user = await requireUser();
  const rows = await prisma.upload.findMany({
    where: user.role === "OWNER" ? {} : { uploaderId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { url: true, kind: true, createdAt: true },
  });
  return rows.map((r) => ({
    url: r.url,
    kind: r.kind,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type MediaResult = { ok?: boolean; error?: string };

// Изтрива качен файл (само качилият го или собственик). Маха и файла от диска.
export async function deleteUploadAction(url: string): Promise<MediaResult> {
  const user = await requireUser();
  const name = url.split("/").pop() ?? "";
  if (!url.startsWith("/uploads/") || !isSafeStoredName(name)) {
    return { error: "Невалиден адрес." };
  }
  const row = await prisma.upload.findUnique({ where: { url } });
  if (!row) return { error: "Файлът не е намерен." };
  if (user.role !== "OWNER" && row.uploaderId !== user.id) {
    return { error: "Нямате права да изтриете този файл." };
  }
  try {
    await unlink(path.join(uploadDir(), name));
  } catch {
    /* файлът вече липсва — продължаваме да чистим записа */
  }
  await prisma.upload.delete({ where: { url } });
  return { ok: true };
}
