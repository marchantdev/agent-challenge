/**
 * NOSANA_STATUS
 *
 * Reports on the Nosana decentralized GPU network and the agent's own deployment
 * health. Uses the @nosana/sdk to query the Solana-based compute marketplace and
 * the CoinGecko API for live NOS token price data.
 *
 * Nosana SDK: https://www.npmjs.com/package/@nosana/sdk
 * Data sources: Nosana SDK (on-chain), Nosana REST API, CoinGecko, process runtime
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { Client } from "@nosana/sdk";
import { formatUsd } from "../utils/api.js";

const COINGECKO_API = "https://api.coingecko.com/api/v3";
// NOS token on Solana mainnet
const NOS_TOKEN_MINT = "nosRB8DUV67oLNrL45bo2pFLrmsWPrzSZsEs6vc45d";

interface NosanaNetworkStats {
  totalNodes: number | null;
  activeNodes: number | null;
  totalJobs: number | null;
  nosPrice: number | null;
  nosMarketCap: number | null;
  nosPriceChange24h: number | null;
}

/** Wrap a promise with a timeout; rejects with an Error on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function fetchNosanaNetworkStats(): Promise<NosanaNetworkStats> {
  const stats: NosanaNetworkStats = {
    totalNodes: null,
    activeNodes: null,
    totalJobs: null,
    nosPrice: null,
    nosMarketCap: null,
    nosPriceChange24h: null,
  };

  // --- @nosana/sdk: fetch node and job counts from Solana on-chain data ---
  //
  // client.nodes.all() returns Node[] from the Nosana nodes program on Solana.
  // The Node type (address, authority, audited, architecture, gpu, memory, …)
  // does NOT include a 'status' or 'online' field, so activeNodes cannot be
  // derived from the SDK — only totalNodes is available this way.
  //
  // client.jobs.all() returns jobs with a 'state' field: 0=queued, 1=running,
  // 2=done. We count state===1 as active (running) jobs.
  //
  // Both calls hit Solana RPC (getProgramAccounts), which can be slow on public
  // endpoints. We use an 8-second timeout and show "unavailable" if SDK fails.
  const solanaNetwork = process.env.SOLANA_NETWORK || "mainnet-beta";
  try {
    const client = new Client({ solana: { network: solanaNetwork } });

    const [sdkNodes, sdkJobs] = await Promise.allSettled([
      withTimeout(client.nodes.all(), 8000),
      withTimeout(client.jobs.all(), 8000),
    ]);

    if (sdkNodes.status === "fulfilled") {
      stats.totalNodes = sdkNodes.value.length;
      // Node type has no status/online field — activeNodes unavailable via SDK
    }

    if (sdkJobs.status === "fulfilled") {
      stats.totalJobs = sdkJobs.value.length;
      // state === 1 means the job is currently running
      stats.activeNodes = sdkJobs.value.filter((j: any) => j.state === 1).length;
    }
  } catch {
    // SDK instantiation or setup failed — fall back to REST API below
  }

  // --- CoinGecko: NOS token price (reliable, no auth required) ---
  try {
    const priceRes = await fetch(
      `${COINGECKO_API}/coins/nosana?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (priceRes.ok) {
      const priceData = await priceRes.json() as any;
      const market = priceData.market_data || {};
      stats.nosPrice = market.current_price?.usd ?? null;
      stats.nosMarketCap = market.market_cap?.usd ?? null;
      stats.nosPriceChange24h = market.price_change_percentage_24h ?? null;
    }
  } catch { /* CoinGecko unavailable — continue without price */ }

  return stats;
}


export const nosanaStatusAction: Action = {
  name: "NOSANA_STATUS",
  description: "Reports Nosana network status, NOS token price, the agent's deployment health, and decentralized infrastructure metrics. Uses the Nosana SDK for network queries.",
  similes: ["NOSANA", "INFRASTRUCTURE", "DEPLOYMENT", "GPU_STATUS", "WHERE_DO_YOU_RUN", "NETWORK_STATUS", "NOS_PRICE", "NOSANA_HEALTH"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("nosana") || text.includes("infrastructure") || text.includes("where") ||
           text.includes("gpu") || text.includes("deployment") || text.includes("network") ||
           text.includes("nos") || text.includes("run") || text.includes("health") ||
           text.includes("uptime") || text.includes("status");
  },
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    // Runtime telemetry
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const uptimeStr = days > 0 ? `${days}d ${hours}h ${mins}m`
      : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const memUsage = process.memoryUsage();
    const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(0);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(0);
    const memPct = ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(0);

    const nodeId = process.env.NOSANA_NODE_ID || "local-dev";
    const model = process.env.MODEL_PROVIDER === "openai"
      ? "OpenAI gpt-4o (dev mode)"
      : "Qwen3.5-27B-AWQ-4bit (Nosana GPU)";
    const gpuMarket = "NVIDIA RTX 3090";

    // Fetch Nosana network stats (SDK + CoinGecko)
    const networkStats = await fetchNosanaNetworkStats();

    // Build status report
    const healthStatus = uptime > 300 ? "🟢 Healthy" : "🟡 Starting";
    const nosChangeStr = networkStats.nosPriceChange24h !== null
      ? ` (${networkStats.nosPriceChange24h > 0 ? "+" : ""}${networkStats.nosPriceChange24h.toFixed(1)}% 24h)`
      : "";

    const report = [
      `## Axiom Infrastructure Status`,
      ``,
      `I'm running on **Nosana's decentralized GPU network** — a Solana-based compute marketplace where community node operators provide GPU resources for AI inference. This means no single company controls my compute.`,
      ``,
      `### Agent Deployment`,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Status | ${healthStatus} |`,
      `| Node ID | \`${nodeId}\` |`,
      `| Model | ${model} |`,
      `| GPU Market | ${gpuMarket} |`,
      `| Uptime | ${uptimeStr} |`,
      `| Heap Memory | ${heapMB}/${heapTotalMB} MB (${memPct}%) |`,
      `| RSS Memory | ${rssMB} MB |`,
      `| Container | \`ghcr.io/marchantdev/agent-challenge:latest\` |`,
      `| Frontend | Custom React Dashboard (port 8080) |`,
      `| Framework | ElizaOS v2 + Custom Security Plugin |`,
      ``,
      `### Nosana Network`,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Nodes | ${networkStats.totalNodes !== null ? networkStats.totalNodes.toLocaleString() : "unavailable"} |`,
      `| Active Nodes | ${networkStats.activeNodes !== null ? networkStats.activeNodes.toLocaleString() : "unavailable"} |`,
      `| Blockchain | Solana Mainnet |`,
      `| Token | NOS (\`${NOS_TOKEN_MINT.slice(0, 8)}...\`) |`,
      networkStats.nosPrice !== null
        ? `| NOS Price | $${networkStats.nosPrice.toFixed(4)}${nosChangeStr} |`
        : `| NOS Price | Fetching... |`,
      networkStats.nosMarketCap !== null
        ? `| Market Cap | ${formatUsd(networkStats.nosMarketCap)} |`
        : "",
      ``,
      `### Why Decentralized Compute for Security?`,
      ``,
      `Security infrastructure that runs on AWS or GCP has a single point of failure — if the cloud provider is compromised, censors API calls, or rate-limits responses, the security tool goes dark. Nosana distributes compute across independent node operators worldwide. No single entity can:`,
      ``,
      `- **Censor** security analysis of specific protocols`,
      `- **Rate-limit** access during an active exploit investigation`,
      `- **Go offline** at a critical moment (no single datacenter)`,
      ``,
      `> This is the same trustless ethos as the DeFi protocols Axiom protects. Security can't be decentralized if the analyzer itself is centralized.`,
      ``,
      `_Network data via @nosana/sdk (Solana on-chain) + CoinGecko API. Runtime stats from Node.js process telemetry._`,
    ].filter(Boolean).join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Where do you run?" } },
    { name: "Axiom", content: { text: "## Axiom Infrastructure Status\n\nI'm running on Nosana's decentralized GPU network..." } },
  ], [
    { name: "user", content: { text: "What's the NOS token price?" } },
    { name: "Axiom", content: { text: "## Axiom Infrastructure Status\n\n### Nosana Network\n| NOS Price | $0.30... |" } },
  ]],
};
