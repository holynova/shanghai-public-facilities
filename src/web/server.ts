import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { AmapApiError, AmapClient } from "../amap/client.js";
import { findNearestFacilitiesByCategory, loadFacilityIndex } from "./facility-index.js";

const projectRoot = process.cwd();
const staticRoot = resolve(projectRoot, "web");
const cataloguePath = resolve(projectRoot, "outputs/2026-07-16/shanghai-public-facilities.csv");
const port = Number(process.env.PORT ?? 4173);
const facilities = loadFacilityIndex(cataloguePath);
const amap = new AmapClient(0);

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  try {
    if (url.pathname === "/health") {
      return sendJson(response, 200, { facilities: facilities.length, status: "ok" });
    }
    if (url.pathname === "/api/nearest") return await handleNearest(request, response);
    return serveStatic(url.pathname, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    console.error(message);
    return sendJson(response, 500, { error: "服务暂时不可用，请稍后重试。" });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Nearby facilities site: http://127.0.0.1:${port}`);
  console.log(`Loaded ${facilities.length} Shanghai facilities from the catalogue.`);
});

async function handleNearest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Only POST is supported." });
  const payload = await readJson(request);
  const address = typeof payload.address === "string" ? payload.address.trim() : "";
  if (address.length < 2 || address.length > 200) {
    return sendJson(response, 400, { error: "请输入 2 到 200 个字符的上海地址。" });
  }

  try {
    const geocodes = await amap.geocode(address, "上海市");
    const location = geocodes[0];
    if (!location?.location) return sendJson(response, 404, { error: "没有找到这个地址，请补充区、路名或门牌号。" });
    const [longitude, latitude] = location.location.split(",").map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return sendJson(response, 502, { error: "地图服务返回了无效坐标，请重试。" });
    }

    const origin = { latitude, longitude };
    return sendJson(response, 200, {
      coordinateSystem: "GCJ-02",
      origin: { ...origin, formattedAddress: location.formattedAddress || address },
      groups: findNearestFacilitiesByCategory(facilities, origin),
    });
  } catch (error) {
    if (error instanceof AmapApiError) {
      return sendJson(response, 502, { error: "地图服务暂时不可用，请稍后重试。" });
    }
    throw error;
  }
}

function serveStatic(pathname: string, response: ServerResponse): void {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(staticRoot, `.${requestedPath}`);
  if (!filePath.startsWith(`${staticRoot}/`) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 10_000) throw new Error("Request body too large.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}
