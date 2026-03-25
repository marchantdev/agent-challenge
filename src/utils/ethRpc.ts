/**
 * ethRpc.ts — Ethereum data utilities via Etherscan V2 API
 *
 * Uses the Etherscan V2 API (api.etherscan.io/v2/api?chainid=1&...)
 * for all on-chain reads: balances, contract code, ERC-20 metadata,
 * and source verification. Requires ETHERSCAN_API_KEY in .env.
 *
 * Falls back to Ethplorer (free, no key) for wallet token holdings.
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

// ─── Etherscan V2 request helper ──────────────────────────────────────────────

async function etherscanV2(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ chainid: "1", ...params, apikey: ETHERSCAN_API_KEY });
  const res = await fetch(`${ETHERSCAN_V2_BASE}?${qs}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Etherscan V2 HTTP ${res.status}`);
  const data = await res.json() as { status?: string; result?: any; message?: string };
  // Proxy-module calls return result directly (hex strings); account/contract modules use status "1"
  return data;
}

// ─── Native balance ───────────────────────────────────────────────────────────

export async function getEthBalance(address: string): Promise<number> {
  const data = await etherscanV2({ module: "account", action: "balance", address, tag: "latest" });
  // result is balance in wei as a decimal string
  const wei = BigInt(data.result ?? "0");
  return Number(wei) / 1e18;
}

// ─── Contract detection (via proxy eth_getCode) ──────────────────────────────

export async function isEthContract(address: string): Promise<boolean> {
  const data = await etherscanV2({ module: "proxy", action: "eth_getCode", address, tag: "latest" });
  const code = data.result as string;
  return Boolean(code && code !== "0x" && code.length > 2);
}

// ─── ABI string decoding ──────────────────────────────────────────────────────

/**
 * Decode an ABI-encoded string return value from eth_call.
 * Handles both dynamic (offset+length+data) and fixed bytes32 formats.
 */
function decodeAbiString(hex: string): string | null {
  if (!hex || hex === "0x") return null;
  const data = hex.replace(/^0x/, "");
  if (data.length === 0) return null;

  // Try dynamic ABI string: offset (32 bytes) + length (32 bytes) + data
  if (data.length >= 128) {
    const offset = parseInt(data.slice(0, 64), 16);
    if (offset === 32) {
      const length = parseInt(data.slice(64, 128), 16);
      if (length > 0 && length <= 256) {
        const strHex = data.slice(128, 128 + length * 2);
        try {
          const text = Buffer.from(strHex, "hex").toString("utf8");
          if (text.length > 0) return text;
        } catch { /* fall through */ }
      }
    }
  }

  // Try fixed bytes32 (old-style tokens like MKR)
  if (data.length === 64) {
    try {
      const bytes = Buffer.from(data, "hex");
      const text = bytes.toString("utf8").replace(/\0+$/g, "");
      if (text.length > 0 && text.split("").every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) {
        return text;
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ─── ERC-20 metadata via eth_call (Etherscan proxy) ───────────────────────────

export async function getErc20Name(address: string): Promise<string | null> {
  try {
    const data = await etherscanV2({ module: "proxy", action: "eth_call", to: address, data: "0x06fdde03", tag: "latest" });
    return decodeAbiString(data.result);
  } catch { return null; }
}

export async function getErc20Symbol(address: string): Promise<string | null> {
  try {
    const data = await etherscanV2({ module: "proxy", action: "eth_call", to: address, data: "0x95d89b41", tag: "latest" });
    return decodeAbiString(data.result);
  } catch { return null; }
}

export async function getErc20TotalSupply(address: string): Promise<bigint | null> {
  try {
    const data = await etherscanV2({ module: "proxy", action: "eth_call", to: address, data: "0x18160ddd", tag: "latest" });
    if (!data.result || data.result === "0x") return null;
    return BigInt(data.result);
  } catch { return null; }
}

// ─── Contract verification via Etherscan V2 ──────────────────────────────────

export async function checkSourcifyVerification(address: string): Promise<"verified" | "partial" | "unverified"> {
  try {
    const data = await etherscanV2({ module: "contract", action: "getsourcecode", address });
    if (data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) return "unverified";
    const src = data.result[0];
    // Etherscan returns ABI as "Contract source code not verified" if unverified
    if (!src.ABI || src.ABI === "Contract source code not verified") return "unverified";
    return "verified";
  } catch { return "unverified"; }
}

// ─── Ethplorer — ETH balance + ERC-20 holdings (no API key required) ─────────

export interface EthplorerToken {
  symbol: string;
  name: string;
  contractAddress: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
}

export interface EthplorerInfo {
  ethBalance: number;
  tokens: EthplorerToken[];
}

export async function fetchEthplorerInfo(address: string): Promise<EthplorerInfo> {
  const res = await fetch(
    `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Ethplorer HTTP ${res.status}`);
  const data = await res.json() as {
    ETH?: { balance?: number };
    tokens?: Array<{
      tokenInfo: { address: string; name: string; symbol: string; decimals?: string | number; price?: { rate?: number } };
      balance: number;
      rawBalance?: string;
    }>;
  };

  const ethBalance = data.ETH?.balance ?? 0;
  const tokens: EthplorerToken[] = (data.tokens ?? []).slice(0, 20).map(t => {
    const decimals = parseInt(String(t.tokenInfo.decimals ?? 18), 10) || 18;
    const rawBal = t.rawBalance ? BigInt(t.rawBalance) : BigInt(Math.round(t.balance));
    const balance = Number(rawBal) / Math.pow(10, decimals);
    const priceUsd = t.tokenInfo.price?.rate ?? null;
    return {
      symbol: t.tokenInfo.symbol || "???",
      name: t.tokenInfo.name || "Unknown Token",
      contractAddress: t.tokenInfo.address,
      balance,
      decimals,
      priceUsd: typeof priceUsd === "number" ? priceUsd : null,
    };
  }).filter(t => t.balance > 0);

  return { ethBalance, tokens };
}
