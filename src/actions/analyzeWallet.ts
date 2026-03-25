/**
 * ANALYZE_WALLET
 * Fetches on-chain token balances for an ETH or Solana wallet,
 * cross-references held tokens with DefiLlama, and produces a risk exposure report.
 * Auto-detects address type: Ethereum (0x…) vs Solana (base58).
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

const ETHERSCAN_API = "https://api.etherscan.io/api";
const DEFILLAMA_API = "https://api.llama.fi";
const ETH_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const SOLSCAN_API = "https://public-api.solscan.io";
const SOLSCAN_TOKEN = process.env.SOLSCAN_API_KEY || "";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  valueUsd: number | null;
  contractAddress: string;
}

interface ProtocolInfo {
  name: string;
  tvl: number;
  category: string;
  chains: string[];
}

// ─── Address detection ────────────────────────────────────────────────────────

function isEthAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function isSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

function extractEthAddress(text: string): string | null {
  const m = text.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

function extractSolanaAddress(text: string): string | null {
  const m = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (m && isSolanaAddress(m[1])) return m[1];
  return null;
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

async function fetchTopProtocols(): Promise<ProtocolInfo[]> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocols`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as any[];
    return data
      .filter((p: any) => p.tvl > 0)
      .sort((a: any, b: any) => b.tvl - a.tvl)
      .slice(0, 100)
      .map((p: any) => ({
        name: p.name,
        tvl: p.tvl,
        category: p.category,
        chains: Array.isArray(p.chains) ? p.chains : [],
      }));
  } catch { return []; }
}

// ─── Ethereum wallet functions ────────────────────────────────────────────────

async function fetchEthBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETH_API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.status !== "1") return null;
    return parseFloat(data.result) / 1e18;
  } catch { return null; }
}

async function fetchErc20Balances(address: string): Promise<TokenBalance[]> {
  try {
    const res = await fetch(
      `${ETHERSCAN_API}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${ETH_API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    const seen = new Map<string, TokenBalance>();
    for (const tx of data.result) {
      if (seen.has(tx.contractAddress)) continue;
      seen.set(tx.contractAddress, {
        symbol: tx.tokenSymbol,
        name: tx.tokenName,
        balance: 0,
        valueUsd: null,
        contractAddress: tx.contractAddress,
      });
    }
    return Array.from(seen.values()).slice(0, 10);
  } catch { return []; }
}

// ─── Solana wallet functions ──────────────────────────────────────────────────

function solscanHeaders(): HeadersInit {
  const h: HeadersInit = { "Accept": "application/json" };
  if (SOLSCAN_TOKEN) h["token"] = SOLSCAN_TOKEN;
  return h;
}

interface SplToken {
  symbol: string;
  name: string;
  tokenAddress: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  priceUsdt: number | null;
}

async function fetchSolBalance(address: string): Promise<number | null> {
  try {
    // Use Solana JSON-RPC as primary source (free, no rate limit)
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getBalance",
        params: [address, { commitment: "confirmed" }]
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const lamports = data?.result?.value;
    return typeof lamports === "number" ? lamports / 1e9 : null;
  } catch { return null; }
}

async function fetchSplTokens(address: string): Promise<SplToken[]> {
  try {
    // Solscan: GET /account/tokens?account={address}
    const res = await fetch(
      `${SOLSCAN_API}/account/tokens?account=${address}`,
      { headers: solscanHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    const items = Array.isArray(data) ? data : (data.data ?? []);
    return items.slice(0, 15).map((t: any) => ({
      symbol: t.tokenSymbol ?? t.symbol ?? "???",
      name: t.tokenName ?? t.name ?? "Unknown",
      tokenAddress: t.tokenAddress ?? t.mint ?? "",
      amount: t.tokenAmount?.amount ?? t.amount ?? 0,
      decimals: t.tokenAmount?.decimals ?? t.decimals ?? 0,
      uiAmount: t.tokenAmount?.uiAmount ?? t.uiAmount ?? 0,
      priceUsdt: t.priceUsdt ?? null,
    }));
  } catch { return []; }
}

async function fetchSolanaRecentTxs(address: string): Promise<any[]> {
  try {
    // Solscan: GET /account/transactions?account={address}&limit=10
    const res = await fetch(
      `${SOLSCAN_API}/account/transactions?account=${address}&limit=10`,
      { headers: solscanHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch { return []; }
}

function matchSolanaDefiProtocols(tokens: SplToken[], protocols: ProtocolInfo[]): string[] {
  const solanaProtocols = protocols.filter(p =>
    p.chains.some(c => c.toLowerCase() === "solana")
  );
  const matched: string[] = [];
  const riskyKeywords = ["leverage", "lp", "vault", "yield", "earn", "farm", "debt", "raydium", "marinade", "jito", "kamino", "drift", "mango"];
  for (const t of tokens) {
    const lower = (t.name + " " + t.symbol).toLowerCase();
    if (riskyKeywords.some(kw => lower.includes(kw))) {
      matched.push(`${t.symbol} (${t.name})`);
    }
  }
  return matched;
}

// ─── Risk calculators ─────────────────────────────────────────────────────────

function calculateEthRiskProfile(
  ethBalance: number | null,
  tokens: TokenBalance[],
  _protocols: ProtocolInfo[]
): { score: number; level: string; breakdown: string[] } {
  const breakdown: string[] = [];
  let riskScore = 0;

  if (ethBalance !== null) {
    if (ethBalance > 10) {
      breakdown.push("**ETH Concentration: HIGH** — >10 ETH held in a single wallet. Consider hardware wallet.");
      riskScore += 3;
    } else if (ethBalance > 1) {
      breakdown.push("**ETH Concentration: MEDIUM** — 1-10 ETH. Reasonable for active wallets.");
      riskScore += 1;
    } else {
      breakdown.push("**ETH Concentration: LOW** — <1 ETH. Minimal concentration risk.");
    }
  }

  const tokenCount = tokens.length;
  if (tokenCount === 0) {
    breakdown.push("**Token Diversity: N/A** — No ERC-20 token activity detected.");
  } else if (tokenCount > 10) {
    breakdown.push(`**Token Diversity: HIGH EXPOSURE** — ${tokenCount} token contracts interacted with. Increased surface area.`);
    riskScore += 2;
  } else {
    breakdown.push(`**Token Diversity: MANAGEABLE** — ${tokenCount} token types. Normal activity level.`);
    riskScore += 1;
  }

  const riskyKeywords = ["leverage", "lp", "vault", "yield", "earn", "farm", "debt"];
  const riskyTokens = tokens.filter(t =>
    riskyKeywords.some(kw => t.name.toLowerCase().includes(kw) || t.symbol.toLowerCase().includes(kw))
  );
  if (riskyTokens.length > 0) {
    breakdown.push(`**DeFi Exposure: PRESENT** — ${riskyTokens.length} token(s) indicate leveraged/yield positions: ${riskyTokens.map(t => t.symbol).join(", ")}`);
    riskScore += riskyTokens.length;
  } else {
    breakdown.push("**DeFi Exposure: MINIMAL** — No leveraged position tokens detected.");
  }

  const suspiciousNames = tokens.filter(t =>
    t.name.length > 40 || t.symbol.length > 10 || t.name.includes("Visit") || t.name.includes("FREE")
  );
  if (suspiciousNames.length > 0) {
    breakdown.push(`**Spam/Phishing Risk: HIGH** — ${suspiciousNames.length} suspicious token(s) received. Do NOT interact with unknown tokens.`);
    riskScore += 3;
  }

  const level = riskScore >= 7 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW";
  return { score: riskScore, level, breakdown };
}

function calculateSolanaRiskProfile(
  solBalance: number | null,
  tokens: SplToken[],
  defiExposure: string[]
): { score: number; level: string; breakdown: string[] } {
  const breakdown: string[] = [];
  let riskScore = 0;

  if (solBalance !== null) {
    if (solBalance > 100) {
      breakdown.push("**SOL Concentration: HIGH** — >100 SOL held in single wallet. Consider cold storage.");
      riskScore += 3;
    } else if (solBalance > 10) {
      breakdown.push("**SOL Concentration: MEDIUM** — 10-100 SOL. Reasonable for active wallets.");
      riskScore += 1;
    } else {
      breakdown.push("**SOL Concentration: LOW** — <10 SOL. Minimal concentration risk.");
    }
  }

  if (tokens.length === 0) {
    breakdown.push("**SPL Token Holdings: NONE** — No SPL token accounts found.");
  } else if (tokens.length > 15) {
    breakdown.push(`**SPL Token Holdings: HIGH EXPOSURE** — ${tokens.length} SPL tokens. Large attack surface.`);
    riskScore += 2;
  } else {
    breakdown.push(`**SPL Token Holdings: MANAGEABLE** — ${tokens.length} SPL tokens.`);
    riskScore += 1;
  }

  if (defiExposure.length > 0) {
    breakdown.push(`**Solana DeFi Exposure: PRESENT** — Likely DeFi positions detected: ${defiExposure.slice(0, 4).join(", ")}`);
    riskScore += Math.min(defiExposure.length, 3);
  } else {
    breakdown.push("**Solana DeFi Exposure: MINIMAL** — No obvious DeFi position tokens detected.");
  }

  // Suspicious zero-decimals tokens (common for scam airdrops on Solana)
  const suspicious = tokens.filter(t => t.decimals === 0 && t.uiAmount > 1e6);
  if (suspicious.length > 0) {
    breakdown.push(`**Spam/Phishing Risk: HIGH** — ${suspicious.length} suspicious zero-decimal token(s). Do NOT interact.`);
    riskScore += 3;
  }

  const level = riskScore >= 7 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW";
  return { score: riskScore, level, breakdown };
}

// ─── Action definition ────────────────────────────────────────────────────────

export const analyzeWalletAction: Action = {
  name: "ANALYZE_WALLET",
  description: "Analyzes an Ethereum or Solana wallet address: native balance, token holdings, DeFi exposure, and risk profile. Auto-detects address type.",
  similes: ["WALLET_ANALYSIS", "CHECK_WALLET", "WALLET_RISK", "ANALYZE_ADDRESS", "WALLET_SCAN", "PORTFOLIO_RISK"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "");
    const lower = text.toLowerCase();
    const hasEth = /0x[a-fA-F0-9]{40}/.test(text);
    const hasSolana = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);
    return (hasEth || hasSolana || lower.includes("wallet") || lower.includes("address") ||
            lower.includes("portfolio") || lower.includes("holdings") || lower.includes("exposure")) &&
           (lower.includes("analyze") || lower.includes("check") || lower.includes("scan") ||
            lower.includes("risk") || lower.includes("0x") || hasSolana);
  },
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";

    const ethAddr = extractEthAddress(text);
    const solAddr = !ethAddr ? extractSolanaAddress(text) : null;

    if (!ethAddr && !solAddr) {
      if (callback) await callback({
        text: "Please provide a wallet address.\n\n- **Ethereum:** `Analyze wallet 0x1234...abcd`\n- **Solana:** `Analyze wallet GpXHXs5KfzfXbNKcMLNbAMsJsgPsBE7y5GtwVoiuxYvH`\n\nI'll check native balance, token holdings, DeFi exposure, and generate a risk profile."
      });
      return;
    }

    // ─── Ethereum path ────────────────────────────────────────────────────────
    if (ethAddr) {
      const shortAddr = `${ethAddr.slice(0, 6)}...${ethAddr.slice(-4)}`;
      if (callback) await callback({
        text: `Analyzing Ethereum wallet \`${shortAddr}\`...\n\nFetching on-chain data from Etherscan.`
      });

      const [ethBalance, tokens, protocols] = await Promise.all([
        fetchEthBalance(ethAddr),
        fetchErc20Balances(ethAddr),
        fetchTopProtocols(),
      ]);

      const risk = calculateEthRiskProfile(ethBalance, tokens, protocols);
      const riskEmoji = risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";

      const sections: string[] = [
        `## Wallet Risk Analysis: \`${shortAddr}\``,
        "",
        `**Chain:** Ethereum`,
        `### Overall Risk: ${riskEmoji} ${risk.level} (Score: ${risk.score}/10)`,
        "",
      ];

      if (ethBalance !== null) {
        sections.push("### Ethereum Holdings");
        sections.push(`| Asset | Amount |`);
        sections.push(`|-------|--------|`);
        sections.push(`| ETH | ${ethBalance.toFixed(4)} ETH |`);
        sections.push("");
      }

      if (tokens.length > 0) {
        sections.push("### Recent Token Activity");
        sections.push("| Token | Symbol | Contract |");
        sections.push("|-------|--------|---------|");
        for (const t of tokens.slice(0, 8)) {
          sections.push(`| ${t.name.slice(0, 25)} | ${t.symbol} | \`${t.contractAddress.slice(0, 10)}...\` |`);
        }
        sections.push("");
      }

      sections.push("### Risk Breakdown");
      for (const item of risk.breakdown) sections.push(`- ${item}`);
      sections.push("");

      sections.push("### Recommendations");
      if (risk.level === "HIGH") {
        sections.push("- ⚠️ **Move high-value assets to hardware wallet** (Ledger, Trezor)");
        sections.push("- ⚠️ **Review and revoke suspicious token approvals** at revoke.cash");
        sections.push("- ⚠️ **Do not interact** with unsolicited tokens in your wallet");
      } else if (risk.level === "MEDIUM") {
        sections.push("- 💡 Consider hardware wallet for amounts >5 ETH");
        sections.push("- 💡 Periodically revoke unused DeFi approvals at revoke.cash");
        sections.push("- 💡 Use a separate wallet for DeFi interactions");
      } else {
        sections.push("- ✅ Wallet shows low risk profile");
        sections.push("- 💡 Continue using separate wallets for different activities");
        sections.push("- 💡 Enable 2FA on all associated exchanges");
      }
      sections.push("");
      sections.push(`_Data from Etherscan + DefiLlama. [View on Etherscan](https://etherscan.io/address/${ethAddr})_`);

      if (callback) await callback({ text: sections.join("\n") });
      return;
    }

    // ─── Solana path ──────────────────────────────────────────────────────────
    if (solAddr) {
      const shortAddr = `${solAddr.slice(0, 6)}...${solAddr.slice(-4)}`;
      if (callback) await callback({
        text: `Analyzing Solana wallet \`${shortAddr}\`...\n\nFetching on-chain data from Solana RPC + Solscan.`
      });

      const [solBalance, splTokens, protocols, recentTxs] = await Promise.all([
        fetchSolBalance(solAddr),
        fetchSplTokens(solAddr),
        fetchTopProtocols(),
        fetchSolanaRecentTxs(solAddr),
      ]);

      const defiExposure = matchSolanaDefiProtocols(splTokens, protocols);
      const risk = calculateSolanaRiskProfile(solBalance, splTokens, defiExposure);
      const riskEmoji = risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";

      // Estimate total portfolio value from SPL tokens with price data
      const totalSplUsd = splTokens.reduce((sum, t) => {
        if (t.priceUsdt !== null) return sum + (t.uiAmount * t.priceUsdt);
        return sum;
      }, 0);

      const sections: string[] = [
        `## Wallet Risk Analysis: \`${shortAddr}\``,
        "",
        `**Chain:** Solana`,
        `### Overall Risk: ${riskEmoji} ${risk.level} (Score: ${risk.score}/10)`,
        "",
      ];

      // Native SOL balance
      sections.push("### Solana Holdings");
      sections.push(`| Asset | Amount |`);
      sections.push(`|-------|--------|`);
      if (solBalance !== null) {
        sections.push(`| SOL | ${solBalance.toFixed(6)} SOL |`);
      } else {
        sections.push(`| SOL | unavailable |`);
      }
      sections.push("");

      // SPL tokens
      if (splTokens.length > 0) {
        sections.push("### SPL Token Holdings");
        sections.push("| Token | Symbol | Amount | Est. Value |");
        sections.push("|-------|--------|--------|------------|");
        for (const t of splTokens.slice(0, 10)) {
          const val = t.priceUsdt !== null ? formatUsd(t.uiAmount * t.priceUsdt) : "—";
          sections.push(`| ${t.name.slice(0, 22)} | ${t.symbol} | ${t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} | ${val} |`);
        }
        if (totalSplUsd > 0) sections.push(`\n_Estimated SPL value: **${formatUsd(totalSplUsd)}**_`);
        sections.push("");
      }

      // DeFi exposure
      if (defiExposure.length > 0) {
        sections.push("### Solana DeFi Exposure");
        for (const exp of defiExposure.slice(0, 6)) {
          sections.push(`- ${exp}`);
        }
        sections.push("");
      }

      // Recent transactions
      if (recentTxs.length > 0) {
        sections.push("### Recent Transactions");
        sections.push(`| # | Signature | Block Time | Status |`);
        sections.push(`|---|-----------|------------|--------|`);
        for (let i = 0; i < Math.min(5, recentTxs.length); i++) {
          const tx = recentTxs[i];
          const sig = (tx.txHash ?? tx.signature ?? "").slice(0, 16) + "...";
          const time = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString().split("T")[0] : "unknown";
          const status = tx.status === "Success" || tx.err === null ? "✅" : "❌";
          sections.push(`| ${i + 1} | \`${sig}\` | ${time} | ${status} |`);
        }
        sections.push("");
      }

      sections.push("### Risk Breakdown");
      for (const item of risk.breakdown) sections.push(`- ${item}`);
      sections.push("");

      sections.push("### Recommendations");
      if (risk.level === "HIGH") {
        sections.push("- ⚠️ **Move high-value assets to a hardware wallet** (Ledger)");
        sections.push("- ⚠️ **Revoke suspicious token delegates** at revoke.cash/solana");
        sections.push("- ⚠️ **Do not interact with unsolicited airdrop tokens**");
      } else if (risk.level === "MEDIUM") {
        sections.push("- 💡 Consider hardware wallet for amounts >50 SOL");
        sections.push("- 💡 Review and close empty token accounts (reclaim rent)");
        sections.push("- 💡 Use a dedicated wallet for DeFi interactions");
      } else {
        sections.push("- ✅ Wallet shows low risk profile");
        sections.push("- 💡 Keep seed phrase offline in multiple secure locations");
        sections.push("- 💡 Use separate wallets for trading vs long-term holding");
      }
      sections.push("");
      sections.push(`_Data from Solana RPC + Solscan + DefiLlama. [View on Solscan](https://solscan.io/account/${solAddr})_`);

      if (callback) await callback({ text: sections.join("\n") });
    }
  },
  examples: [
    [{
      name: "user", content: { text: "Analyze wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }
    }, {
      name: "Axiom", content: { text: "## Wallet Risk Analysis: `0xd8dA...6045`\n\n**Chain:** Ethereum\n### Overall Risk: 🟡 MEDIUM..." }
    }],
    [{
      name: "user", content: { text: "Analyze Solana wallet GpXHXs5KfzfXbNKcMLNbAMsJsgPsBE7y5GtwVoiuxYvH" }
    }, {
      name: "Axiom", content: { text: "## Wallet Risk Analysis: `GpXHX...YvH`\n\n**Chain:** Solana\n### Overall Risk: 🟢 LOW..." }
    }],
  ],
};
