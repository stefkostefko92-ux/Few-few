// Minimal zero-dependency static server for the KAGURA demo.
// Serves the client/ directory so /demo/index.html can import /dist/index.js.
//
//   npm run demo        # builds the SDK, then serves on :5173
//
// Point the demo at a backend started with:
//   CORS_ORIGINS=http://localhost:5173 ENABLE_DEV_RECEIPTS=true npm run dev
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path === "/") path = "/demo/index.html";
    if (path.endsWith("/")) path += "index.html"; // /admin/ → /admin/index.html
    // Prevent path traversal.
    const filePath = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`KAGURA demo on http://localhost:${port}/demo/  (backend expected on :3000)`);
});
