import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const root = resolve(valueAfter("--dir", "out"));
const port = Number(valueAfter("--port", process.env.PORT ?? "3000"));
const host = valueAfter("--host", "127.0.0.1");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid static server port: ${port}`);
}
if (!existsSync(resolve(root, "play.html"))) {
  throw new Error(
    `Static export not found at ${root}. Run npm run build:e2e before Playwright.`,
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
    const status = file.endsWith(`${sep}404.html`) ? 404 : 200;
    response.writeHead(status, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
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
