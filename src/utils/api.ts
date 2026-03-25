/**
 * Shared API utilities for Axiom actions.
 * Provides cached fetching, formatting, and common API clients.
 */

const DEFILLAMA_API = "https://api.llama.fi";
const ETHERSCAN_API = "https://api.etherscan.io/api";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "YourApiKeyToken";

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();

export async function cachedFetch(url: string, ttlMs = 300_000): Promise<any> {
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expires) return cached.data;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const data = await res.json();
  cache.set(url, { data, expires: Date.now() + ttlMs });
  return data;
}

export async function fetchDefiLlamaProtocols(): Promise<any[]> {
  return cachedFetch(`${DEFILLAMA_API}/protocols`);
}

export async function fetchEtherscanBalance(address: string): Promise<string> {
  const data = await cachedFetch(
    `${ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_KEY}`,
    60_000
  );
  return data.result || "0";
}

export async function fetchEtherscanSource(address: string): Promise<any> {
  const data = await cachedFetch(
    `${ETHERSCAN_API}?module=contract&action=getsourcecode&address=${address}&apikey=${ETHERSCAN_KEY}`,
    60_000
  );
  return data.result?.[0] || {};
}

export async function fetchEtherscanTxList(address: string, count = 5): Promise<any[]> {
  const data = await cachedFetch(
    `${ETHERSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${count}&sort=asc&apikey=${ETHERSCAN_KEY}`,
    60_000
  );
  return Array.isArray(data.result) ? data.result : [];
}

export function formatUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function extractProtocolName(text: string): string {
  const nameMatch = text.match(
    /(?:risk|assess|analyze|security|safe|check)\s+(?:of\s+)?(?:the\s+)?([A-Za-z0-9\s.]+?)(?:\s+protocol|\s+v\d|\s*$)/i
  ) || text.match(/(?:is\s+)([A-Za-z0-9\s.]+?)(?:\s+safe|\s+risky|\s+secure)/i);

  return nameMatch
    ? nameMatch[1].trim()
    : text.replace(/\b(assess|risk|analyze|protocol|the|of|how|is|safe|secure|security|check|about|tell|me)\b/gi, "").trim();
}

export function extractEthAddress(text: string): string | null {
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}
