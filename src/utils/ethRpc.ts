/**
 * ethRpc.ts — Ethereum JSON-RPC utilities
 *
 * Uses publicnode.com's free public Ethereum RPC endpoint (no API key required).
 * Mirror of solanaRpc.ts design for consistency.
 */

const ETH_RPC_URL = process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";

// ─── Base RPC call ────────────────────────────────────────────────────────────

export async function ethRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(ETH_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ETH RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`ETH RPC: ${data.error.message}`);
  return data.result;
}

// ─── Native balance ───────────────────────────────────────────────────────────

export async function getEthBalance(address: string): Promise<number> {
  const hex = await ethRpc("eth_getBalance", [address, "latest"]) as string;
  return parseInt(hex, 16) / 1e18;
}

// ─── Contract detection ───────────────────────────────────────────────────────

export async function isEthContract(address: string): Promise<boolean> {
  const code = await ethRpc("eth_getCode", [address, "latest"]) as string;
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

// ─── ERC-20 metadata via eth_call ─────────────────────────────────────────────

export async function getErc20Name(address: string): Promise<string | null> {
  try {
    const hex = await ethRpc("eth_call", [{ to: address, data: "0x06fdde03" }, "latest"]) as string;
    return decodeAbiString(hex);
  } catch { return null; }
}

export async function getErc20Symbol(address: string): Promise<string | null> {
  try {
    const hex = await ethRpc("eth_call", [{ to: address, data: "0x95d89b41" }, "latest"]) as string;
    return decodeAbiString(hex);
  } catch { return null; }
}

export async function getErc20TotalSupply(address: string): Promise<bigint | null> {
  try {
    const hex = await ethRpc("eth_call", [{ to: address, data: "0x18160ddd" }, "latest"]) as string;
    if (!hex || hex === "0x") return null;
    return BigInt(hex);
  } catch { return null; }
}

// ─── Contract verification via Sourcify ──────────────────────────────────────

export async function checkSourcifyVerification(address: string): Promise<"verified" | "partial" | "unverified"> {
  try {
    const res = await fetch(
      `https://sourcify.dev/server/v2/contract/1/${address}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return "unverified";
    const data = await res.json() as { match?: string; runtimeMatch?: string };
    if (data.match === "match" || data.runtimeMatch === "match") return "verified";
    if (data.match === "partial" || data.runtimeMatch === "partial") return "partial";
    return "unverified";
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
