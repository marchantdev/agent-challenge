/**
 * ANALYZE_WALLET
 * Fetches on-chain token balances for an ETH or Solana wallet,
 * cross-references held tokens with DefiLlama, and produces a risk exposure report.
 * Auto-detects address type: Ethereum (0x…) vs Solana (base58).
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

import { solanaRpc, WELL_KNOWN_TOKENS } from "../utils/solanaRpc.js";
import { fetchEthplorerInfo } from "../utils/ethRpc.js";
import { formatUsd } from "../utils/api.js";

const DEFILLAMA_API = "https://api.llama.fi";

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

// ─── Ethereum wallet functions (Ethplorer — no API key required) ─────────────

async function fetchEthWalletData(address: string): Promise<{
  ethBalance: number | null;
  tokens: TokenBalance[];
}> {
  try {
    const info = await fetchEthplorerInfo(address);
    const tokens: TokenBalance[] = info.tokens.map(t => ({
      symbol: t.symbol,
      name: t.name,
      balance: t.balance,
      valueUsd: t.priceUsd !== null ? t.balance * t.priceUsd : null,
      contractAddress: t.contractAddress,
    }));
    return { ethBalance: info.ethBalance, tokens };
  } catch {
    return { ethBalance: null, tokens: [] };
  }
}

// ─── Solana wallet functions (Solana JSON-RPC — no API key required) ──────────

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
    const result = await solanaRpc("getBalance", [address, { commitment: "confirmed" }]) as any;
    const lamports = result?.value;
    return typeof lamports === "number" ? lamports / 1e9 : null;
  } catch { return null; }
}

async function fetchSplTokens(address: string): Promise<SplToken[]> {
  try {
    // getTokenAccountsByOwner returns all SPL token accounts for this wallet
    const result = await solanaRpc("getTokenAccountsByOwner", [
      address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]) as any;
    const accounts: any[] = result?.value ?? [];
    return accounts
      .slice(0, 15)
      .map((acct: any) => {
        const info = acct?.account?.data?.parsed?.info;
        if (!info) return null;
        const mint: string = info.mint ?? "";
        const ta = info.tokenAmount ?? {};
        const uiAmount: number = ta.uiAmount ?? 0;
        // Skip zero-balance accounts
        if (uiAmount === 0 && (ta.amount === "0" || ta.amount === 0)) return null;
        const known = WELL_KNOWN_TOKENS[mint];
        return {
          symbol:       known?.symbol ?? mint.slice(0, 6) + "…",
          name:         known?.name   ?? `Token (${mint.slice(0, 8)}…)`,
          tokenAddress: mint,
          amount:       parseInt(ta.amount ?? "0", 10),
          decimals:     ta.decimals ?? 0,
          uiAmount,
          priceUsdt:    null,  // RPC has no price data — DefiLlama could be added later
        } as SplToken;
      })
      .filter((t): t is SplToken => t !== null);
  } catch { return []; }
}

async function fetchSolanaRecentTxs(address: string): Promise<any[]> {
  try {
    // getSignaturesForAddress returns { signature, slot, blockTime, err }
    const result = await solanaRpc("getSignaturesForAddress", [
      address,
      { limit: 10 },
    ]) as any[];
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

function matchSolanaDefiProtocols(tokens: SplToken[], _protocols: ProtocolInfo[]): string[] {
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
        text: `Analyzing Ethereum wallet \`${shortAddr}\`...\n\nFetching on-chain data from Ethplorer + DefiLlama.`
      });

      const [walletData, protocols] = await Promise.all([
        fetchEthWalletData(ethAddr),
        fetchTopProtocols(),
      ]);
      const { ethBalance, tokens } = walletData;

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
        sections.push("### ERC-20 Token Holdings");
        sections.push("| Token | Symbol | Balance | Est. Value |");
        sections.push("|-------|--------|---------|------------|");
        for (const t of tokens.slice(0, 8)) {
          const val = t.valueUsd !== null ? formatUsd(t.valueUsd) : "—";
          const bal = t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 });
          sections.push(`| ${t.name.slice(0, 22)} | ${t.symbol} | ${bal} | ${val} |`);
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
      sections.push(`_Data from Ethplorer + DefiLlama. [View on Etherscan](https://etherscan.io/address/${ethAddr})_`);

      if (callback) await callback({ text: sections.join("\n") });
      return;
    }

    // ─── Solana path ──────────────────────────────────────────────────────────
    if (solAddr) {
      const shortAddr = `${solAddr.slice(0, 6)}...${solAddr.slice(-4)}`;
      if (callback) await callback({
        text: `Analyzing Solana wallet \`${shortAddr}\`...\n\nFetching on-chain data from Solana JSON-RPC.`
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
          const sig = (tx.signature ?? "").slice(0, 16) + "...";
          const time = tx.blockTime ? new Date((tx.blockTime as number) * 1000).toISOString().split("T")[0] : "unknown";
          const status = tx.err === null ? "✅" : "❌";
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
      sections.push(`_Data from Solana JSON-RPC + DefiLlama. [View on Solscan](https://solscan.io/account/${solAddr})_`);

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
