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

const KNOWN_EXPLOITS: Exploit[] = [
  { name: "Ronin Bridge", date: "2022-03-23", amount: 625_000_000, chain: "Ethereum", technique: "Validator key compromise" },
  { name: "Poly Network", date: "2021-08-10", amount: 611_000_000, chain: "Multi", technique: "Cross-chain relay exploit" },
  { name: "Wormhole", date: "2022-02-02", amount: 326_000_000, chain: "Solana", technique: "Signature verification bypass" },
  { name: "Mixin Network", date: "2023-09-23", amount: 200_000_000, chain: "Multi", technique: "Cloud provider breach" },
  { name: "Euler Finance", date: "2023-03-13", amount: 197_000_000, chain: "Ethereum", technique: "Donation attack" },
  { name: "Nomad Bridge", date: "2022-08-01", amount: 190_000_000, chain: "Ethereum", technique: "Initialization bug" },
  { name: "Beanstalk", date: "2022-04-17", amount: 182_000_000, chain: "Ethereum", technique: "Flash loan governance" },
  { name: "Cream Finance", date: "2021-10-27", amount: 130_000_000, chain: "Ethereum", technique: "Flash loan + oracle manipulation" },
  { name: "Multichain", date: "2023-07-06", amount: 126_000_000, chain: "Multi", technique: "MPC key compromise" },
  { name: "Badger DAO", date: "2021-12-02", amount: 120_000_000, chain: "Ethereum", technique: "Frontend injection" },
  { name: "Mango Markets", date: "2022-10-11", amount: 114_000_000, chain: "Solana", technique: "Oracle manipulation" },
  { name: "Orbit Chain", date: "2023-12-31", amount: 81_500_000, chain: "Multi", technique: "Bridge signer compromise" },
  { name: "Curve Finance", date: "2023-07-30", amount: 73_500_000, chain: "Ethereum", technique: "Vyper compiler reentrancy" },
  { name: "Radiant Capital", date: "2024-10-16", amount: 50_000_000, chain: "Multi", technique: "Private key compromise" },
  { name: "KyberSwap", date: "2023-11-22", amount: 48_800_000, chain: "Multi", technique: "Precision manipulation" },
  { name: "BonqDAO", date: "2023-02-01", amount: 120_000_000, chain: "Polygon", technique: "Oracle manipulation" },
  { name: "Harmony Bridge", date: "2022-06-23", amount: 100_000_000, chain: "Multi", technique: "Multisig key theft" },
  { name: "Wintermute", date: "2022-09-20", amount: 160_000_000, chain: "Ethereum", technique: "Vanity address exploit" },
  { name: "Platypus Finance", date: "2023-02-16", amount: 8_500_000, chain: "Avalanche", technique: "Flash loan + staking logic" },
  { name: "Atomic Wallet", date: "2023-06-03", amount: 100_000_000, chain: "Multi", technique: "Private key extraction" },
  { name: "dForce", date: "2020-04-19", amount: 25_000_000, chain: "Ethereum", technique: "ERC-777 reentrancy" },
  { name: "Yearn Finance", date: "2021-02-04", amount: 11_000_000, chain: "Ethereum", technique: "Flash loan + misconfiguration" },
  { name: "Sentiment", date: "2023-04-04", amount: 1_000_000, chain: "Arbitrum", technique: "Read-only reentrancy" },
  { name: "Level Finance", date: "2023-05-01", amount: 1_100_000, chain: "BSC", technique: "Referral reward exploit" },
  { name: "Exactly Protocol", date: "2023-08-18", amount: 7_200_000, chain: "Optimism", technique: "Permit + liquidation logic" },
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
