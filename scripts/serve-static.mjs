import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { createGzip } from "node:zlib";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const root = resolve(valueAfter("--dir", "out"));
const port = Number(valueAfter("--port", process.env.PORT ?? "3000"));
const host = valueAfter("--host", "127.0.0.1");
const requireE2EBridge = args.includes("--require-e2e-bridge");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid static server port: ${port}`);
}
if (!existsSync(resolve(root, "play.html"))) {
  throw new Error(
    `Static export not found at ${root}. Run npm run build:e2e before Playwright.`,
  );
}
if (requireE2EBridge && !existsSync(resolve(root, ".e2e-bridge.json"))) {
  throw new Error(
    `Instrumented E2E export not found at ${root}. Run npm run build:e2e before Playwright.`,
  );
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const compressibleExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);
const rangeExtensions = new Set([".mp3"]);

function cacheControlFor(requestPath) {
  if (requestPath.startsWith("/_next/static/")) {
    return "public, max-age=31536000, immutable";
  }
  if (requestPath.startsWith("/images/") || requestPath.startsWith("/audio/")) {
    return "public, max-age=86400";
  }
  return "public, max-age=0, must-revalidate";
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match) return null;
  const requestedStart = match[1] ? Number(match[1]) : undefined;
  const requestedEnd = match[2] ? Number(match[2]) : undefined;
  if (requestedStart === undefined && requestedEnd === undefined) return null;
  const isSuffixRange = requestedStart === undefined;
  const start = isSuffixRange ? Math.max(0, size - requestedEnd) : requestedStart;
  const end = isSuffixRange ? size - 1 : Math.min(size - 1, requestedEnd ?? size - 1);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    return null;
  }
  return { start, end };
}

function findStaticFile(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?", 1)[0] || "/");
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidates = [relativePath];
  if (!extname(relativePath)) {
    candidates.push(`${relativePath}.html`, `${relativePath}/index.html`);
  }

  for (const candidate of candidates) {
    const absolute = resolve(root, candidate);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) continue;
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return resolve(root, "404.html");
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  try {
    const file = findStaticFile(request.url ?? "/");
    const requestPath = decodeURIComponent((request.url ?? "/").split("?", 1)[0]);
    const extension = extname(file);
    const fileSize = statSync(file).size;
    const range = rangeExtensions.has(extension)
      ? parseByteRange(request.headers.range, fileSize)
      : null;
    const status = file.endsWith(`${sep}404.html`) ? 404 : range ? 206 : 200;
    const headers = {
      "Accept-Ranges": rangeExtensions.has(extension) ? "bytes" : "none",
      "Cache-Control": cacheControlFor(requestPath),
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    };
    if (range) {
      headers["Content-Length"] = String(range.end - range.start + 1);
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileSize}`;
    }
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(
      request.headers["accept-encoding"] ?? "",
    );
    const gzip = !range && acceptsGzip && compressibleExtensions.has(extension);
    if (gzip) {
      headers["Content-Encoding"] = "gzip";
      headers.Vary = "Accept-Encoding";
    } else if (!range) {
      headers["Content-Length"] = String(fileSize);
    }
    response.writeHead(status, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
    if (gzip) stream.pipe(createGzip()).pipe(response);
    else stream.pipe(response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Static server error");
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
