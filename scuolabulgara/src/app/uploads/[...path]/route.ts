import { NextRequest } from "next/server";
import { readUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  // Defense in depth: never let an upload execute as active content.
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox; style-src 'unsafe-inline'",
  "Accept-Ranges": "bytes",
};

// Serves uploaded media from the on-disk uploads directory. Byte ranges are
// supported because Safari will not play audio from a server without them.
// In production you may also let nginx serve /uploads directly (see DEPLOY.md).
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const file = await readUpload((path || []).join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  const total = file.data.length;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    end = Math.min(end, total - 1);
    if (start > end || start >= total) {
      return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${total}` } });
    }
    start = Math.max(0, start);
    return new Response(new Uint8Array(file.data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...HEADERS, "Content-Type": file.mime, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(file.data), { headers: { ...HEADERS, "Content-Type": file.mime, "Content-Length": String(total) } });
}
