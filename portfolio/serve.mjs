#!/usr/bin/env node
// serve.mjs — локален статичен сървър за dist/ (само за преглед/скрийншоти; в продукция е Nginx).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const PORT = Number(process.env.PORT || 4180);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    let s = await stat(file).catch(() => null);
    if (s?.isDirectory()) { file = join(file, "index.html"); s = await stat(file).catch(() => null); }
    if (!s) { res.writeHead(404, { "content-type": MIME[".html"] }); return res.end(await readFile(join(ROOT, "404.html"))); }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e?.message || e)); }
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
