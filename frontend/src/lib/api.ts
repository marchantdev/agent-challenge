import type { Protocol, Exploit, NosanaHealth, NosanaMetrics } from "./types";

const DEFILLAMA_BASE = "https://api.llama.fi";
const AGENT_BASE = "/api"; // proxied to ElizaOS

// --- DefiLlama ---

export async function fetchProtocols(): Promise<Protocol[]> {
  const res = await fetch(`${DEFILLAMA_BASE}/protocols`);
  if (!res.ok) throw new Error("Failed to fetch protocols");
  const data = await res.json();
  return (data as any[])
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
}

// --- DeFi Rekt / Exploit data ---

const KNOWN_EXPLOITS: Exploit[] = [
  { name: "Euler Finance", date: "2023-03-13", amount: 197_000_000, chain: "Ethereum", technique: "Donation attack" },
  { name: "Mango Markets", date: "2022-10-11", amount: 114_000_000, chain: "Solana", technique: "Oracle manipulation" },
  { name: "Beanstalk", date: "2022-04-17", amount: 182_000_000, chain: "Ethereum", technique: "Flash loan governance" },
  { name: "Wormhole", date: "2022-02-02", amount: 326_000_000, chain: "Solana", technique: "Signature verification bypass" },
  { name: "Nomad Bridge", date: "2022-08-01", amount: 190_000_000, chain: "Ethereum", technique: "Initialization bug" },
  { name: "Ronin Bridge", date: "2022-03-23", amount: 625_000_000, chain: "Ethereum", technique: "Validator key compromise" },
  { name: "Poly Network", date: "2021-08-10", amount: 611_000_000, chain: "Multi", technique: "Cross-chain relay exploit" },
  { name: "Cream Finance", date: "2021-10-27", amount: 130_000_000, chain: "Ethereum", technique: "Flash loan + oracle manipulation" },
  { name: "Badger DAO", date: "2021-12-02", amount: 120_000_000, chain: "Ethereum", technique: "Frontend injection" },
  { name: "Multichain", date: "2023-07-06", amount: 126_000_000, chain: "Multi", technique: "MPC key compromise" },
  { name: "Curve Finance", date: "2023-07-30", amount: 73_500_000, chain: "Ethereum", technique: "Vyper compiler reentrancy" },
  { name: "KyberSwap", date: "2023-11-22", amount: 48_800_000, chain: "Multi", technique: "Precision manipulation" },
  { name: "Radiant Capital", date: "2024-10-16", amount: 50_000_000, chain: "Multi", technique: "Private key compromise" },
  { name: "Orbit Chain", date: "2023-12-31", amount: 81_500_000, chain: "Multi", technique: "Bridge signer compromise" },
  { name: "Mixin Network", date: "2023-09-23", amount: 200_000_000, chain: "Multi", technique: "Cloud provider breach" },
];

export function getExploits(filter?: { chain?: string; minAmount?: number }): Exploit[] {
  let result = [...KNOWN_EXPLOITS];
  if (filter?.chain && filter.chain !== "All") {
    result = result.filter((e) => e.chain.toLowerCase().includes(filter.chain!.toLowerCase()));
  }
  if (filter?.minAmount) {
    result = result.filter((e) => e.amount >= filter.minAmount!);
  }
  return result.sort((a, b) => b.amount - a.amount);
}

export function getTotalExploitLoss(): number {
  return KNOWN_EXPLOITS.reduce((sum, e) => sum + e.amount, 0);
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
    // ElizaOS returns an array of messages
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

// --- Contract inspection ---

export async function inspectContract(address: string): Promise<any> {
  const isEth = address.startsWith("0x") && address.length === 42;
  if (!isEth) return { error: "Only Ethereum addresses supported in this version" };

  const ETHERSCAN_KEY = "YourApiKeyToken"; // free tier
  const base = "https://api.etherscan.io/api";

  const [balRes, txRes, srcRes] = await Promise.all([
    fetch(`${base}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_KEY}`),
    fetch(`${base}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${ETHERSCAN_KEY}`),
    fetch(`${base}?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_KEY}`),
  ]);

  const balance = await balRes.json();
  const tx = await txRes.json();
  const src = await srcRes.json();

  const weiBalance = balance.result || "0";
  const ethBalance = (parseInt(weiBalance) / 1e18).toFixed(4);
  const verified = src.result?.[0]?.SourceCode ? true : false;
  const contractName = src.result?.[0]?.ContractName || "Unknown";
  const isProxy = src.result?.[0]?.Proxy === "1";

  return {
    address,
    chain: "Ethereum",
    balance: `${ethBalance} ETH`,
    txCount: tx.result?.length > 0 ? parseInt(tx.result[0].blockNumber) : 0,
    verified,
    contractName,
    isProxy,
  };
}
