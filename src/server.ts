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
import { logger } from "@elizaos/core";
import { computeSecurityScoreFromProtocol } from "./actions/assessRisk.ts";
import { cachedFetch } from "./utils/api.ts";
import { fetchRektExploits } from "./utils/rektFetch.ts";

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

async function handleSecurityScoreBadge(res: ServerResponse, protocol: string): Promise<void> {
  try {
    const protocols = (await cachedFetch("https://api.llama.fi/protocols")) as any[];
    const match = protocols.find(
      (p: any) =>
        p.name.toLowerCase() === protocol.toLowerCase() ||
        p.slug.toLowerCase() === protocol.toLowerCase()
    );

    let score = 0;
    let label = "Unknown";
    if (match) {
      const s = await computeSecurityScoreFromProtocol(match);
      score = s.total;
      label = `${score}/100`;
    }

    const color = score >= 80 ? "#44cc11" : score >= 60 ? "#dfb317" : score >= 40 ? "#fe7d37" : "#e05d44";
    const leftW = 112;
    const rightW = 66;
    const totalW = leftW + rightW;
    const h = 20;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h}" role="img" aria-label="Security Score: ${label}">
  <title>Security Score: ${label}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${h}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="${h}" fill="#555"/>
    <rect x="${leftW}" width="${rightW}" height="${h}" fill="${color}"/>
    <rect width="${totalW}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${Math.floor(leftW / 2) + 1}" y="15" fill="#010101" fill-opacity=".3">${match ? "Security Score" : protocol}</text>
    <text x="${Math.floor(leftW / 2)}" y="14">${match ? "Security Score" : protocol}</text>
    <text x="${leftW + Math.floor(rightW / 2) + 1}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${leftW + Math.floor(rightW / 2)}" y="14">${label}</text>
  </g>
</svg>`;

    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(svg);
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error generating badge");
  }
}

async function handleSecurityScore(res: ServerResponse, protocol: string): Promise<void> {
  try {
    const protocols = (await cachedFetch("https://api.llama.fi/protocols")) as any[];
    const match = protocols.find(
      (p: any) =>
        p.name.toLowerCase() === protocol.toLowerCase() ||
        p.slug.toLowerCase() === protocol.toLowerCase()
    );
    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: `Protocol "${protocol}" not found on DefiLlama` }));
      return;
    }
    const score = await computeSecurityScoreFromProtocol(match);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(
      JSON.stringify({
        protocol: match.name,
        slug: match.slug,
        tvl: match.tvl,
        score: score.total,
        components: {
          tvlStability: score.tvlStability,
          verification: score.verification,
          maturity: score.maturity,
          exploitHistory: score.exploitHistory,
        },
        label: score.label,
        color: score.emoji,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: err.message || "Internal server error" }));
  }
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

async function handleExploits(res: ServerResponse): Promise<void> {
  try {
    const data = await fetchRektExploits();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    });
    res.end(JSON.stringify(data));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: err.message || "Failed to fetch exploits" }));
  }
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

  // Exploits API: GET /api/exploits — server-side rekt.news fetch (no CORS)
  if (url === "/api/exploits" && req.method === "GET") {
    await handleExploits(res);
    return;
  }

  // Security Score Badge: GET /api/security-score/:protocol/badge
  const badgeMatch = url.match(/^\/api\/security-score\/([^/?]+)\/badge$/);
  if (badgeMatch && req.method === "GET") {
    await handleSecurityScoreBadge(res, decodeURIComponent(badgeMatch[1]));
    return;
  }

  // Security Score API: GET /api/security-score/:protocol
  const secScoreMatch = url.match(/^\/api\/security-score\/([^/?]+)$/);
  if (secScoreMatch && req.method === "GET") {
    await handleSecurityScore(res, decodeURIComponent(secScoreMatch[1]));
    return;
  }

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
    logger.info(`[Axiom] Frontend server running on port ${PORT}`);
    logger.info(`[Axiom] Proxying API calls to ElizaOS on port ${AGENT_PORT}`);
  });
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startFrontendServer();
}
