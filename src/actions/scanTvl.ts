/**
 * SCAN_DEFI_TVL
 * Fetches live DeFi protocol rankings from DefiLlama with filtering and trend analysis.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

const DEFILLAMA_API = "https://api.llama.fi";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export const scanTvlAction: Action = {
  name: "SCAN_DEFI_TVL",
  description: "Fetches live DeFi TVL rankings from DefiLlama. Supports filtering by category and chain.",
  similes: ["TVL", "RANKINGS", "TOP_PROTOCOLS", "DEFI_STATS", "PROTOCOL_RANKINGS", "TVL_SCAN"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("tvl") || text.includes("ranking") || text.includes("top protocol") ||
           text.includes("biggest") || text.includes("defi") || text.includes("protocol");
  },
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = (message.content?.text || "").toLowerCase();

    try {
      const res = await fetch(`${DEFILLAMA_API}/protocols`);
      if (!res.ok) throw new Error(`DefiLlama API returned ${res.status}`);
      const data = await res.json() as any[];

      // Determine filters from message
      const categories = ["lending", "dexes", "liquid staking", "bridge", "cdp", "yield", "derivatives"];
      const chains = ["ethereum", "solana", "bsc", "arbitrum", "polygon", "avalanche", "base", "optimism"];

      let categoryFilter: string | null = null;
      let chainFilter: string | null = null;

      for (const cat of categories) {
        if (text.includes(cat)) { categoryFilter = cat; break; }
      }
      for (const chain of chains) {
        if (text.includes(chain)) { chainFilter = chain; break; }
      }

      let filtered = data.filter((p: any) => p.tvl > 0);

      if (categoryFilter) {
        filtered = filtered.filter((p: any) =>
          (p.category || "").toLowerCase() === categoryFilter
        );
      }
      if (chainFilter) {
        filtered = filtered.filter((p: any) =>
          (p.chains || []).some((c: string) => c.toLowerCase() === chainFilter)
        );
      }

      filtered.sort((a: any, b: any) => b.tvl - a.tvl);
      const top = filtered.slice(0, 15);

      // Flag anomalies
      const anomalies = top.filter((p: any) =>
        p.change_1d !== null && p.change_1d !== undefined && Math.abs(p.change_1d) > 10
      );

      const table = top.map((p: any, i: number) => {
        const change1d = p.change_1d !== null && p.change_1d !== undefined ? `${p.change_1d > 0 ? "+" : ""}${p.change_1d.toFixed(1)}%` : "N/A";
        const change7d = p.change_7d !== null && p.change_7d !== undefined ? `${p.change_7d > 0 ? "+" : ""}${p.change_7d.toFixed(1)}%` : "N/A";
        const flag = anomalies.includes(p) ? " ⚠" : "";
        return `| ${i + 1} | ${p.name}${flag} | ${formatUsd(p.tvl)} | ${change1d} | ${change7d} | ${p.category || "?"} |`;
      });

      const header = categoryFilter ? ` (${categoryFilter})` : chainFilter ? ` (${chainFilter})` : "";
      const totalTvl = top.reduce((s: number, p: any) => s + p.tvl, 0);

      const report = [
        `## DeFi TVL Rankings${header}`,
        ``,
        `| # | Protocol | TVL | 24h | 7d | Category |`,
        `|---|----------|-----|-----|-----|----------|`,
        ...table,
        ``,
        `**Total (shown):** ${formatUsd(totalTvl)} | **Protocols found:** ${filtered.length}`,
        anomalies.length > 0 ? `\n⚠ **Anomalies detected:** ${anomalies.map((p: any) => `${p.name} (${p.change_1d > 0 ? "+" : ""}${p.change_1d.toFixed(1)}%)`).join(", ")}` : "",
        ``,
        `> Filter by category (lending, dexes, bridge) or chain (ethereum, solana, arbitrum).`,
        `> Use ASSESS_PROTOCOL_RISK for detailed analysis of any protocol.`,
      ].join("\n");

      if (callback) await callback({ text: report });
    } catch (err) {
      if (callback) await callback({
        text: `Error fetching TVL data: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  },
  examples: [[
    { name: "user", content: { text: "Show me the top DeFi protocols by TVL" } },
    { name: "Axiom", content: { text: "Fetching live TVL rankings from DefiLlama..." } },
  ]],
};
