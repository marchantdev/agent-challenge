/**
 * Solana JSON-RPC utilities
 * Uses api.mainnet-beta.solana.com — no API key required.
 * Replaces deprecated public-api.solscan.io (v1, 404 as of 2026-03).
 */

export const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

export async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`Solana RPC: ${json.error.message}`);
  return json.result;
}

/** Derive a human-readable account type from RPC getAccountInfo response value. */
export function deriveAccountType(owner: string, executable: boolean): string {
  if (executable) return "program";
  if (owner === "11111111111111111111111111111111") return "wallet";
  if (owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") return "token_account";
  if (owner === "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s") return "nft_metadata";
  if (owner === "Stake11111111111111111111111111111111111111") return "stake_account";
  return "data_account";
}

/**
 * Well-known Solana token mints → name/symbol.
 * Used to resolve SPL token identities without a separate API call.
 */
export const WELL_KNOWN_TOKENS: Record<string, { symbol: string; name: string }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC",  name: "USD Coin" },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT",  name: "Tether USD" },
  "So11111111111111111111111111111111111111112":   { symbol: "wSOL",  name: "Wrapped SOL" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL",  name: "Marinade staked SOL" },
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": { symbol: "jitoSOL", name: "Jito Staked SOL" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK",  name: "Bonk" },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  { symbol: "JUP",   name: "Jupiter" },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",   name: "Raydium" },
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE":  { symbol: "ORCA",  name: "Orca" },
  "HZ1JovNiVvGrGs518Vu4sW3JG12HZWB3KEETpwmJya5":  { symbol: "PYTH",  name: "Pyth Network" },
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL":  { symbol: "JTO",   name: "Jito Governance" },
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof":  { symbol: "RNDR",  name: "Render" },
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": { symbol: "ETH",   name: "Wrapped Ether (Wormhole)" },
  "MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey":  { symbol: "MNDE",  name: "Marinade Finance" },
  "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt":  { symbol: "SRM",   name: "Serum" },
  "StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT":  { symbol: "STEP",  name: "Step Finance" },
  "AFbX8oGjGpmVFywbVouvhQSRmiW2aR1mohfahi4Y2AdB":  { symbol: "GST",   name: "Green Satoshi Token" },
  "7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx": { symbol: "GMT",   name: "STEPN" },
  "kinXdEcpDQeHPEuQnqmUgtYykqKCSVreKzpTfa6bsNm":  { symbol: "KIN",   name: "Kin" },
  "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7": { symbol: "NOS",   name: "Nosana" },
};
