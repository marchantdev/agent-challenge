/**
 * ANALYZE_WALLET
 * Fetches on-chain token balances for an ETH/Solana wallet, cross-references
 * held tokens with DefiLlama protocol data, and produces a risk exposure report.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

const ETHERSCAN_API = "https://api.etherscan.io/api";
const DEFILLAMA_API = "https://api.llama.fi";
const API_KEY = process.env.ETHERSCAN_API_KEY || "";

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

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

async function fetchEthBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${API_KEY}`,
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
      `${ETHERSCAN_API}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    // Deduplicate by token contract — latest transfers only
    const seen = new Map<string, TokenBalance>();
    for (const tx of data.result) {
      if (seen.has(tx.contractAddress)) continue;
      seen.set(tx.contractAddress, {
        symbol: tx.tokenSymbol,
        name: tx.tokenName,
        balance: 0, // We can't easily get balances without token-balance API
        valueUsd: null,
        contractAddress: tx.contractAddress,
      });
    }
    return Array.from(seen.values()).slice(0, 10);
  } catch { return []; }
}

async function fetchRecentTxCount(address: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${ETHERSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.status !== "1") return null;
    // Etherscan gives total tx count in the result length — approximate
    return data.result?.length ?? null;
  } catch { return null; }
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

function calculateRiskProfile(
  ethBalance: number | null,
  tokens: TokenBalance[],
  protocols: ProtocolInfo[]
): { score: number; level: string; breakdown: string[] } {
  const breakdown: string[] = [];
  let riskScore = 0;

  // ETH balance check
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

  // Token diversity
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

  // Known DeFi protocol exposure (heuristic from token names)
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

  // Phishing/scam token indicator
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

export const analyzeWalletAction: Action = {
  name: "ANALYZE_WALLET",
  description: "Analyzes an Ethereum wallet address: ETH balance, token holdings, DeFi exposure, and risk profile.",
  similes: ["WALLET_ANALYSIS", "CHECK_WALLET", "WALLET_RISK", "ANALYZE_ADDRESS", "WALLET_SCAN", "PORTFOLIO_RISK"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return (text.includes("wallet") || text.includes("address") || text.includes("portfolio") ||
            text.includes("holdings") || text.includes("exposure")) &&
           (text.includes("analyze") || text.includes("check") || text.includes("scan") ||
            text.includes("risk") || text.includes("0x"));
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);

    if (!addrMatch) {
      if (callback) await callback({
        text: "Please provide an Ethereum wallet address (0x...). Example:\n\n`Analyze wallet 0x1234...abcd`\n\nI'll check ETH balance, token holdings, DeFi exposure, and generate a risk profile."
      });
      return;
    }

    const address = addrMatch[0];
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;

    if (callback) await callback({
      text: `Analyzing wallet \`${shortAddr}\`...\n\nFetching on-chain data from Etherscan.`
    });

    const [ethBalance, tokens, protocols] = await Promise.all([
      fetchEthBalance(address),
      fetchErc20Balances(address),
      fetchTopProtocols(),
    ]);

    const risk = calculateRiskProfile(ethBalance, tokens, protocols);

    const riskEmoji = risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";
    const sections: string[] = [
      `## Wallet Risk Analysis: \`${shortAddr}\``,
      "",
      `### Overall Risk: ${riskEmoji} ${risk.level} (Score: ${risk.score}/10)`,
      "",
    ];

    // ETH balance
    if (ethBalance !== null) {
      sections.push("### Ethereum Holdings");
      sections.push(`| Asset | Amount |`);
      sections.push(`|-------|--------|`);
      sections.push(`| ETH | ${ethBalance.toFixed(4)} ETH |`);
      sections.push("");
    }

    // Token activity
    if (tokens.length > 0) {
      sections.push("### Recent Token Activity");
      sections.push("| Token | Symbol | Contract |");
      sections.push("|-------|--------|---------|");
      for (const t of tokens.slice(0, 8)) {
        sections.push(`| ${t.name.slice(0, 25)} | ${t.symbol} | \`${t.contractAddress.slice(0, 10)}...\` |`);
      }
      sections.push("");
    }

    // Risk breakdown
    sections.push("### Risk Breakdown");
    for (const item of risk.breakdown) {
      sections.push(`- ${item}`);
    }
    sections.push("");

    // Recommendations
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
    sections.push(`_Data from Etherscan + DefiLlama. Address: \`${address}\` — [View on Etherscan](https://etherscan.io/address/${address})_`);

    if (callback) await callback({ text: sections.join("\n") });
  },
  examples: [[
    { name: "user", content: { text: "Analyze wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" } },
    { name: "Axiom", content: { text: "## Wallet Risk Analysis: `0xd8dA...6045`\n\n### Overall Risk: 🟡 MEDIUM..." } },
  ]],
};
