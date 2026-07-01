import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir, contentTypeForName, isSafeStoredName } from "@/lib/uploads";

export const runtime = "nodejs";

// Сервира качените изображения от UPLOAD_DIR. Приема само нашите имена
// (<uuid>.<ext>) — така няма path traversal и няма достъп до чужди файлове.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await params;
  const name = parts?.[parts.length - 1] ?? "";
  if (parts.length !== 1 || !isSafeStoredName(name)) {
    return new NextResponse("Не е намерено", { status: 404 });
  }
  const type = contentTypeForName(name);
  if (!type) return new NextResponse("Не е намерено", { status: 404 });

  try {
    const buf = await readFile(path.join(uploadDir(), name));
    return new NextResponse(buf, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Не е намерено", { status: 404 });
  }
}
