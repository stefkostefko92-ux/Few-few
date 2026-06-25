import { NextRequest } from "next/server";
import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves uploaded media from the on-disk uploads directory. In production you
// may also let nginx serve /uploads directly for speed (see DEPLOY.md).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rel = (path || []).join("/");
  const file = await readUpload(rel);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Defense in depth: never let an upload execute as active content.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox; style-src 'unsafe-inline'",
    },
  });
}
