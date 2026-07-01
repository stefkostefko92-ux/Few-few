import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import {
  MAX_UPLOAD_BYTES,
  sniffImageType,
  uploadDir,
  newStoredName,
} from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Качване на изображение (само вписан потребител). Валидира размер и реален тип
// по магични байтове; записва на диск със случайно име и връща публичен URL.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Неоторизиран." }, { status: 401 });

  if (!rateLimit(`upload:${user.id}`, 40, 60_000)) {
    return NextResponse.json({ error: "Твърде много качвания. Опитайте по-късно." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Липсва файл." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Файлът е твърде голям (макс. 5 MB)." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImageType(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "Разрешени са само PNG, JPEG, WEBP или GIF изображения." },
      { status: 415 },
    );
  }

  const dir = uploadDir();
  const name = newStoredName(kind);
  const url = `/uploads/${name}`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
  } catch (err) {
    console.error("Качване: неуспешен запис", err);
    return NextResponse.json({ error: "Неуспешно записване." }, { status: 500 });
  }

  // Записваме в медийната библиотека (за преизползване/изтриване). Провалът тук
  // не бива да проваля самото качване.
  try {
    await prisma.upload.create({
      data: { url, kind, bytes: bytes.length, uploaderId: user.id },
    });
  } catch (err) {
    console.error("Качване: неуспешен запис в библиотеката", err);
  }

  return NextResponse.json({ url });
}
