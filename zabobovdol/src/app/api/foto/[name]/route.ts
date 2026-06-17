import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { uploadDir, CONTENT_TYPES } from "@/lib/uploads";

export const runtime = "nodejs";

// Сервира качените снимки от папката за качвания (безопасно име, без изход от папката).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const data = await fs.readFile(path.join(uploadDir(), name));
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const type = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
