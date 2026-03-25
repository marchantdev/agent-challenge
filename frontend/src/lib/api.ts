import type { Protocol, Exploit, NosanaHealth, NosanaMetrics, NosanaNetwork } from "./types";

const DEFILLAMA_BASE = "https://api.llama.fi";
const AGENT_BASE = "/api"; // proxied to ElizaOS

// --- DefiLlama ---

let protocolCache: { data: Protocol[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function fetchProtocols(): Promise<Protocol[]> {
  if (protocolCache && Date.now() - protocolCache.ts < CACHE_TTL) {
    return protocolCache.data;
  }
  const res = await fetch(`${DEFILLAMA_BASE}/protocols`);
  if (!res.ok) throw new Error("Failed to fetch protocols");
  const data = await res.json();
  const protocols = (data as any[])
    .filter((p) => p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 100)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      tvl: p.tvl,
      change_1d: p.change_1d ?? null,
      change_7d: p.change_7d ?? null,
      category: p.category || "Unknown",
      chains: p.chains || [],
      logo: p.logo,
    }));
  protocolCache = { data: protocols, ts: Date.now() };
  return protocols;
}

// --- DeFi Rekt / Exploit data ---
// Curated exploit database — updated March 2026
// Used as primary dataset for dashboard and as fallback when DefiLlama is paywalled

const KNOWN_EXPLOITS: Exploit[] = [
  // 2024-2025
  { name: "WazirX", date: "2024-07-18", amount: 235_000_000, chain: "Ethereum", technique: "Multisig compromise" },
  { name: "Radiant Capital", date: "2024-10-16", amount: 50_000_000, chain: "Multi", technique: "Private key compromise" },
  { name: "Munchables", date: "2024-03-26", amount: 62_500_000, chain: "Blast", technique: "Insider / rogue developer" },
  { name: "PlayDapp", date: "2024-02-09", amount: 32_350_000, chain: "Ethereum", technique: "Private key compromise" },
  { name: "Hedgey Finance", date: "2024-04-19", amount: 44_700_000, chain: "Ethereum", technique: "Input validation flaw" },
  { name: "UwU Lend", date: "2024-06-10", amount: 19_400_000, chain: "Ethereum", technique: "Oracle manipulation" },
  { name: "Sonne Finance", date: "2024-05-15", amount: 20_000_000, chain: "Optimism", technique: "Donation attack (empty market)" },
  { name: "Socket", date: "2024-01-16", amount: 3_300_000, chain: "Ethereum", technique: "Approval exploit via bridge aggregator" },
  { name: "Abracadabra / MIM", date: "2024-01-30", amount: 6_500_000, chain: "Ethereum", technique: "Oracle manipulation" },
  // 2023
  { name: "Mixin Network", date: "2023-09-23", amount: 200_000_000, chain: "Multi", technique: "Cloud provider breach" },
  { name: "Euler Finance", date: "2023-03-13", amount: 197_000_000, chain: "Ethereum", technique: "Donation attack" },
  { name: "Multichain", date: "2023-07-06", amount: 126_000_000, chain: "Multi", technique: "MPC key compromise" },
  { name: "Atomic Wallet", date: "2023-06-03", amount: 100_000_000, chain: "Multi", technique: "Private key extraction" },
  { name: "Curve Finance", date: "2023-07-30", amount: 73_500_000, chain: "Ethereum", technique: "Vyper compiler reentrancy" },
  { name: "Stake.com", date: "2023-09-04", amount: 41_300_000, chain: "Multi", technique: "Private key compromise" },
  { name: "CoinEx", date: "2023-09-12", amount: 70_000_000, chain: "Multi", technique: "Hot wallet compromise" },
  { name: "Orbit Chain", date: "2023-12-31", amount: 81_500_000, chain: "Multi", technique: "Bridge signer compromise" },
  { name: "KyberSwap", date: "2023-11-22", amount: 48_800_000, chain: "Multi", technique: "Precision manipulation" },
  { name: "BonqDAO", date: "2023-02-01", amount: 120_000_000, chain: "Polygon", technique: "Oracle manipulation" },
  { name: "Platypus Finance", date: "2023-02-16", amount: 8_500_000, chain: "Avalanche", technique: "Flash loan + staking logic" },
  { name: "Sentiment", date: "2023-04-04", amount: 1_000_000, chain: "Arbitrum", technique: "Read-only reentrancy" },
  { name: "Exactly Protocol", date: "2023-08-18", amount: 7_200_000, chain: "Optimism", technique: "Permit + liquidation logic" },
  { name: "Level Finance", date: "2023-05-01", amount: 1_100_000, chain: "BSC", technique: "Referral reward exploit" },
  { name: "Yearn Finance v2", date: "2023-04-13", amount: 11_600_000, chain: "Ethereum", technique: "Misconfigured yUSDT" },
  // 2022
  { name: "Ronin Bridge", date: "2022-03-23", amount: 625_000_000, chain: "Ethereum", technique: "Validator key compromise" },
  { name: "BNB Bridge", date: "2022-10-06", amount: 586_000_000, chain: "BSC", technique: "Proof forgery (IAVL tree)" },
  { name: "FTX", date: "2022-11-11", amount: 477_000_000, chain: "Multi", technique: "Insider theft / unauthorized transfers" },
  { name: "Wormhole", date: "2022-02-02", amount: 326_000_000, chain: "Solana", technique: "Signature verification bypass" },
  { name: "Nomad Bridge", date: "2022-08-01", amount: 190_000_000, chain: "Ethereum", technique: "Initialization bug (replica root)" },
  { name: "Beanstalk", date: "2022-04-17", amount: 182_000_000, chain: "Ethereum", technique: "Flash loan governance" },
  { name: "Wintermute", date: "2022-09-20", amount: 160_000_000, chain: "Ethereum", technique: "Vanity address exploit (Profanity)" },
  { name: "Harmony Bridge", date: "2022-06-23", amount: 100_000_000, chain: "Multi", technique: "Multisig key theft" },
  { name: "Mango Markets", date: "2022-10-11", amount: 114_000_000, chain: "Solana", technique: "Oracle manipulation" },
  { name: "Cashio", date: "2022-03-23", amount: 52_000_000, chain: "Solana", technique: "Infinite mint (collateral validation bypass)" },
  // 2021
  { name: "Poly Network", date: "2021-08-10", amount: 611_000_000, chain: "Multi", technique: "Cross-chain relay exploit" },
  { name: "Cream Finance", date: "2021-10-27", amount: 130_000_000, chain: "Ethereum", technique: "Flash loan + oracle manipulation" },
  { name: "Vulcan Forged", date: "2021-12-13", amount: 135_000_000, chain: "Polygon", technique: "Private key compromise" },
  { name: "Badger DAO", date: "2021-12-02", amount: 120_000_000, chain: "Ethereum", technique: "Frontend injection (Cloudflare API key)" },
  { name: "Compound", date: "2021-09-29", amount: 80_000_000, chain: "Ethereum", technique: "Governance proposal bug (excess COMP)" },
  { name: "Yearn Finance", date: "2021-02-04", amount: 11_000_000, chain: "Ethereum", technique: "Flash loan + misconfiguration" },
  { name: "Pancake Bunny", date: "2021-05-19", amount: 45_000_000, chain: "BSC", technique: "Flash loan + price manipulation" },
  // 2020
  { name: "dForce / Lendf.Me", date: "2020-04-19", amount: 25_000_000, chain: "Ethereum", technique: "ERC-777 reentrancy" },
  { name: "Harvest Finance", date: "2020-10-26", amount: 34_000_000, chain: "Ethereum", technique: "Flash loan + USDC/USDT arbitrage" },
  { name: "Pickle Finance", date: "2020-11-21", amount: 20_000_000, chain: "Ethereum", technique: "Evil jar swap exploit" },
];

export function getExploits(filter?: { chain?: string; minAmount?: number; technique?: string }): Exploit[] {
  let result = [...KNOWN_EXPLOITS];
  if (filter?.chain && filter.chain !== "All") {
    result = result.filter((e) => e.chain.toLowerCase().includes(filter.chain!.toLowerCase()));
  }
  if (filter?.minAmount) {
    result = result.filter((e) => e.amount >= filter.minAmount!);
  }
  if (filter?.technique) {
    result = result.filter((e) => e.technique.toLowerCase().includes(filter.technique!.toLowerCase()));
  }
  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getTotalExploitLoss(): number {
  return KNOWN_EXPLOITS.reduce((sum, e) => sum + e.amount, 0);
}

export function getExploitsByTechnique(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of KNOWN_EXPLOITS) {
    const key = e.technique.split("+")[0].trim();
    map[key] = (map[key] || 0) + e.amount;
  }
  return map;
}

// --- Live Exploit Feed (rekt.news primary, DeFiLlama fallback, static last resort) ---

let exploitCache: { data: Exploit[]; ts: number } | null = null;
const EXPLOIT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function parseRektDate(dateStr: string): string {
  if (!dateStr) return "Unknown";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const [month, day, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function tryFetchRektNews(): Promise<Exploit[]> {
  const res = await fetch("https://rekt.news/leaderboard/", {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`rekt.news HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("__NEXT_DATA__ not found");
  const nextData = JSON.parse(match[1]) as { props?: { pageProps?: { leaderboard?: unknown[] } } };
  const leaderboard = nextData?.props?.pageProps?.leaderboard;
  if (!Array.isArray(leaderboard) || leaderboard.length === 0) throw new Error("No leaderboard data");

  const chainMap: Record<string, string> = {
    bsc: "BSC", "binance smart chain": "BSC", ethereum: "Ethereum", solana: "Solana",
    polygon: "Polygon", arbitrum: "Arbitrum", optimism: "Optimism", avalanche: "Avalanche",
    base: "Base", blast: "Blast", sui: "Sui", "sui network": "Sui", tron: "TRON",
    fantom: "Fantom",
  };
  function extractChain(tags: string[]): string {
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      for (const [key, value] of Object.entries(chainMap)) {
        if (lower === key || lower.includes(key)) return value;
      }
    }
    return "Multi";
  }

  return (leaderboard as Array<{ title: string; rekt: { amount?: number; date?: string }; tags?: string[] }>)
    .filter((e) => e?.rekt?.amount && e.rekt.amount > 0)
    .map((e) => ({
      name: e.title.replace(/\s*[-\u2013]\s*(REKT|Rekt)\s*\d*\s*$/gi, "").trim(),
      date: parseRektDate(e.rekt.date ?? ""),
      amount: e.rekt.amount as number,
      chain: extractChain(e.tags ?? []),
      technique: (e.tags ?? []).find((t) =>
        /flash.?loan|oracle|reentrancy|bridge|private.?key|access.?control|rug.?pull/i.test(t)
      ) ?? "Unknown",
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function fetchExploitsLive(): Promise<Exploit[]> {
  if (exploitCache && Date.now() - exploitCache.ts < EXPLOIT_CACHE_TTL) {
    return exploitCache.data;
  }

  // 1. Primary: /api/exploits — our own backend proxies rekt.news (no CORS)
  try {
    const res = await fetch("/api/exploits");
    if (!res.ok) throw new Error(`/api/exploits returned ${res.status}`);
    const data = await res.json() as Exploit[];
    if (!Array.isArray(data) || data.length === 0) throw new Error("Empty response");
    exploitCache = { data, ts: Date.now() };
    return data;
  } catch {
    // backend unavailable — fall through to static
  }

  // 2. Last resort: static curated dataset
  const fallback = [...KNOWN_EXPLOITS].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  exploitCache = { data: fallback, ts: Date.now() };
  return fallback;
}

// --- Agent chat ---

export async function sendMessage(agentId: string, text: string): Promise<string> {
  try {
    const res = await fetch(`${AGENT_BASE}/${agentId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        userId: "axiom-dashboard",
        roomId: "axiom-dashboard-room",
      }),
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((m: any) => m.text).join("\n\n");
    }
    return data.text || JSON.stringify(data);
  } catch {
    return "Agent is currently offline. Please check the Nosana deployment status.";
  }
}

// --- Health/Metrics ---

export async function fetchHealth(): Promise<NosanaHealth> {
  try {
    const res = await fetch(`${AGENT_BASE}/health`);
    if (!res.ok) throw new Error("Health check failed");
    return await res.json();
  } catch {
    return {
      status: "offline",
      uptimeSeconds: 0,
      inferenceLatencyMs: 0,
      actionsTriggered: 0,
      nosanaNode: "unknown",
      model: "Qwen3.5-27B-AWQ-4bit",
      lastHeartbeat: new Date().toISOString(),
    };
  }
}

export async function fetchMetrics(): Promise<NosanaMetrics> {
  try {
    const res = await fetch(`${AGENT_BASE}/metrics`);
    if (!res.ok) throw new Error("Metrics fetch failed");
    return await res.json();
  } catch {
    return {
      requestsTotal: 0,
      requestsByAction: {},
      avgResponseTimeMs: 0,
      errorRate: 0,
      protocolsMonitored: 0,
    };
  }
}

// --- Nosana Network ---

export async function fetchNosanaNetwork(): Promise<NosanaNetwork> {
  try {
    const res = await fetch("https://dashboard.nosana.com/api/nodes");
    if (!res.ok) throw new Error("Nosana API unavailable");
    const data = await res.json();
    const nodes = Array.isArray(data) ? data : data.nodes || [];
    const gpuTypes = [...new Set(nodes.map((n: any) => n.gpu || n.gpuType || "Unknown").filter(Boolean))];
    const active = nodes.filter((n: any) => n.status === "active" || n.state === "running");
    return {
      totalNodes: nodes.length,
      activeJobs: active.length,
      gpuTypes: gpuTypes.slice(0, 8) as string[],
      networkVersion: "1.0",
    };
  } catch {
    return {
      totalNodes: 0,
      activeJobs: 0,
      gpuTypes: [],
      networkVersion: "unavailable",
    };
  }
}

// --- Risk detection helpers ---

export function detectAnomalies(protocols: Protocol[]): Protocol[] {
  return protocols.filter(
    (p) => (p.change_1d !== null && p.change_1d < -10) || (p.change_7d !== null && p.change_7d < -20)
  );
}

export function formatUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
