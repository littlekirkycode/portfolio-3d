/**
 * Static preview of the exported site (out/), honouring the production base
 * path. `npx serve out` can only serve at the domain root, which makes a
 * production-parity build (NEXT_PUBLIC_BASE_PATH=/portfolio-3d) unpreviewable
 * — every asset URL 404s. This serves out/ under the same prefix the build
 * was made with:
 *
 *   npm run build && npm start                       # root, like local dev
 *   NEXT_PUBLIC_BASE_PATH=/portfolio-3d npm run build
 *   NEXT_PUBLIC_BASE_PATH=/portfolio-3d npm start    # → http://localhost:4173/portfolio-3d/
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const OUT = new URL("../out", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (BASE) {
      if (path === "/" || path === BASE) {
        res.writeHead(302, { location: `${BASE}/` });
        return res.end();
      }
      if (!path.startsWith(`${BASE}/`)) {
        res.writeHead(404);
        return res.end("outside base path");
      }
      path = path.slice(BASE.length);
    }
    if (path.endsWith("/")) path += "index.html";
    if (!extname(path)) path += ".html";
    const file = normalize(join(OUT, path));
    if (!file.startsWith(normalize(OUT))) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(OUT, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
}).listen(PORT, () => {
  console.log(`preview: http://localhost:${PORT}${BASE || ""}/  (out/${BASE ? `, base ${BASE}` : ""})`);
});
