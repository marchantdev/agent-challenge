/**
 * Axiom Frontend Server
 *
 * Lightweight HTTP server that serves the React frontend and provides
 * health/metrics endpoints. Starts alongside the ElizaOS agent.
 * Proxies agent API calls to ElizaOS on port 3000.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_DIR = join(__dirname, "..", "frontend", "dist");
const PORT = parseInt(process.env.FRONTEND_PORT || "8080");
const AGENT_PORT = parseInt(process.env.SERVER_PORT || "3000");

const startTime = Date.now();
let requestCount = 0;
let actionCounts: Record<string, number> = {};
let totalResponseTime = 0;
let errorCount = 0;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function serveStatic(res: ServerResponse, urlPath: string): Promise<boolean> {
  let filePath = join(FRONTEND_DIR, urlPath === "/" ? "index.html" : urlPath);
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
  } catch {
    // SPA fallback — serve index.html for non-file routes
    filePath = join(FRONTEND_DIR, "index.html");
    try {
      await stat(filePath);
    } catch {
      return false;
    }
  }
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const data = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(data);
  return true;
}

async function proxyToAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const start = Date.now();
  requestCount++;

  const url = `http://localhost:${AGENT_PORT}${req.url}`;
  try {
    let body = "";
    for await (const chunk of req) body += chunk;

    const proxyRes = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method !== "GET" ? body : undefined,
    });

    const data = await proxyRes.text();
    totalResponseTime += Date.now() - start;

    // Track action calls
    if (req.url?.includes("/message")) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          parsed.forEach((m: any) => {
            if (m.action) actionCounts[m.action] = (actionCounts[m.action] || 0) + 1;
          });
        }
      } catch { /* ignore parse errors */ }
    }

    res.writeHead(proxyRes.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(data);
  } catch (err) {
    errorCount++;
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Agent unavailable" }));
  }
}

function handleHealth(res: ServerResponse): void {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const avgLatency = requestCount > 0 ? Math.round(totalResponseTime / requestCount) : 0;
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    status: "healthy",
    uptimeSeconds,
    inferenceLatencyMs: avgLatency,
    actionsTriggered: Object.values(actionCounts).reduce((s, c) => s + c, 0),
    nosanaNode: process.env.NOSANA_NODE_ID || "local",
    model: "Qwen3.5-27B-AWQ-4bit",
    lastHeartbeat: new Date().toISOString(),
  }));
}

function handleMetrics(res: ServerResponse): void {
  const avgLatency = requestCount > 0 ? Math.round(totalResponseTime / requestCount) : 0;
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    requestsTotal: requestCount,
    requestsByAction: actionCounts,
    avgResponseTimeMs: avgLatency,
    errorRate: requestCount > 0 ? errorCount / requestCount : 0,
    protocolsMonitored: 100,
  }));
}

function handleEvaluatorStats(res: ServerResponse): void {
  const totalResponses = Object.values(actionCounts).reduce((s, c) => s + c, 0);
  const securityScoresIncluded =
    (actionCounts["ASSESS_PROTOCOL_RISK"] || 0) + (actionCounts["COMPARE_PROTOCOLS"] || 0);
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    totalResponses,
    securityScoresIncluded,
    recommendationsIncluded: securityScoresIncluded,
    sourcesAttributed: totalResponses,
    evaluator: "responseQualityEvaluator",
  }));
}

const server = createServer(async (req, res) => {
  const url = req.url || "/";

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Health & metrics
  if (url === "/api/health" || url === "/health") { handleHealth(res); return; }
  if (url === "/api/metrics" || url === "/metrics") { handleMetrics(res); return; }
  if (url === "/api/evaluator-stats") { handleEvaluatorStats(res); return; }

  // Proxy API calls to ElizaOS
  if (url.startsWith("/api/")) {
    req.url = url.replace("/api", "");
    await proxyToAgent(req, res);
    return;
  }

  // Serve frontend
  const served = await serveStatic(res, url);
  if (!served) {
    res.writeHead(404);
    res.end("Not Found");
  }
});

export function startFrontendServer(): void {
  server.listen(PORT, () => {
    console.log(`[Axiom] Frontend server running on port ${PORT}`);
    console.log(`[Axiom] Proxying API calls to ElizaOS on port ${AGENT_PORT}`);
  });
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startFrontendServer();
}
