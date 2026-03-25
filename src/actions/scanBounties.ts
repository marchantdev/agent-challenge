/**
 * SCAN_BOUNTIES
 * Scans Immunefi bug bounty programs for opportunities with high reward potential.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

export const scanBountiesAction: Action = {
  name: "SCAN_BOUNTIES",
  description: "Scans Immunefi bug bounty programs for opportunities in the $5K-$100K reward range.",
  similes: ["FIND_BOUNTIES", "SEARCH_BOUNTIES", "BOUNTY_SCAN", "LIST_PROGRAMS", "IMMUNEFI"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("bounty") || text.includes("immunefi") || text.includes("program") || text.includes("hunt");
  },
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    try {
      const response = await fetch("https://immunefi.com/immunefi.json", { headers: { "User-Agent": "Axiom/1.0" } });
      type Program = { project: string; maximum_reward: number; assets?: Array<{ type?: string }> };
      let programs: Program[] = [];
      if (response.ok) {
        const data = await response.json() as { bounties?: Program[] };
        programs = data.bounties || [];
      }
      const mediumTier = programs.filter(p => p.maximum_reward >= 5000 && p.maximum_reward <= 100000)
        .sort((a, b) => b.maximum_reward - a.maximum_reward).slice(0, 10);
      if (mediumTier.length === 0) {
        if (callback) await callback({ text: "Could not fetch Immunefi programs. Check https://immunefi.com/bug-bounty/ directly." });
        return;
      }
      const lines = mediumTier.map((p, i) => {
        const assets = [...new Set((p.assets || []).map(a => a.type).filter(Boolean))].join(", ");
        return `| ${i + 1} | ${p.project} | $${p.maximum_reward.toLocaleString()} | ${assets || "mixed"} |`;
      });
      const report = [
        `## Immunefi Programs — Medium Tier ($5K-$100K)`,
        ``,
        `| # | Project | Max Reward | Assets |`,
        `|---|---------|------------|--------|`,
        ...lines,
        ``,
        `> Use AUDIT_RECON on a project's GitHub to check recent code changes and audit history.`,
      ].join("\n");
      if (callback) await callback({ text: report });
    } catch (err) {
      if (callback) await callback({ text: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
  examples: [[
    { name: "user", content: { text: "Show me new Immunefi bounty programs." } },
    { name: "Axiom", content: { text: "Scanning for medium-tier Immunefi programs..." } },
  ]],
};
