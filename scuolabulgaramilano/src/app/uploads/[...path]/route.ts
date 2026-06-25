import { NextRequest } from "next/server";
import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves uploaded media from the on-disk uploads directory. In production you
// may also let nginx serve /uploads directly for speed (see DEPLOY.md).
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const rel = (params.path || []).join("/");
  const file = await readUpload(rel);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
