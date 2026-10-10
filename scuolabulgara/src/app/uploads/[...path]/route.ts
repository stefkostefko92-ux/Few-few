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

// A PDF (sniffed as one on upload) is shown by the browser's own viewer, which
// a sandboxed document can't host — so it gets no sandbox, only nosniff.
const PDF_HEADERS = {
  "Cache-Control": HEADERS["Cache-Control"],
  "X-Content-Type-Options": "nosniff",
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
  const base = file.mime === "application/pdf" ? PDF_HEADERS : HEADERS;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    end = Math.min(end, total - 1);
    if (start > end || start >= total) {
      return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
    }
    start = Math.max(0, start);
    return new Response(new Uint8Array(file.data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...base, "Content-Type": file.mime, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(file.data), { headers: { ...base, "Content-Type": file.mime, "Content-Length": String(total) } });
}
