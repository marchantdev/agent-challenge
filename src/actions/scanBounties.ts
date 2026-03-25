/**
 * SCAN_BOUNTIES
 * Scans Immunefi bug bounty programs using their live sitemap.
 * Immunefi's public immunefi.json was deprecated; we now parse their sitemap
 * for live program slugs sorted by last-modified date.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

interface BountyProgram {
  name: string;
  slug: string;
  lastmod: string;
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    // Fix common abbreviations
    .replace(/\bDefi\b/g, "DeFi")
    .replace(/\bDao\b/g, "DAO")
    .replace(/\bNft\b/g, "NFT")
    .replace(/\bAmm\b/g, "AMM")
    .replace(/\bAave\b/g, "Aave")
    .replace(/\bV2\b/g, "V2")
    .replace(/\bV3\b/g, "V3");
}

async function fetchImmunefiBounties(): Promise<BountyProgram[]> {
  const res = await fetch("https://immunefi.com/sitemap-dynamic.xml", {
    headers: { "User-Agent": "Axiom-Security/1.0 (DeFi Security Scanner)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
  const xml = await res.text();

  // Extract bug-bounty URLs with their lastmod timestamps
  const urlPattern = /<url>\s*<loc>https:\/\/immunefi\.com\/bug-bounty\/([^/]+)\/<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  const programs: BountyProgram[] = [];
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(xml)) !== null) {
    const slug = match[1];
    const lastmod = match[2].slice(0, 10); // YYYY-MM-DD
    programs.push({ slug, name: slugToName(slug), lastmod });
  }

  // Sort by lastmod descending (most recently active first)
  programs.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
  return programs;
}

export const scanBountiesAction: Action = {
  name: "SCAN_BOUNTIES",
  description: "Lists active Immunefi bug bounty programs, sorted by most recently active. Shows program names and last activity date.",
  similes: ["FIND_BOUNTIES", "SEARCH_BOUNTIES", "BOUNTY_SCAN", "LIST_PROGRAMS", "IMMUNEFI"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("bounty") || text.includes("immunefi") || text.includes("program") || text.includes("hunt");
  },
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    try {
      const programs = await fetchImmunefiBounties();

      if (programs.length === 0) {
        if (callback) await callback({
          text: "Could not fetch Immunefi programs. Visit https://immunefi.com/bug-bounty/ directly."
        });
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const activeToday = programs.filter(p => p.lastmod === today);
      const recentWeek = programs.filter(p => p.lastmod >= today.slice(0, 8) + "01");
      const top20 = programs.slice(0, 20);

      const lines = top20.map((p, i) =>
        `| ${i + 1} | [${p.name}](https://immunefi.com/bug-bounty/${p.slug}/) | ${p.lastmod} |`
      );

      const report = [
        `## Immunefi Bug Bounty Programs`,
        ``,
        `**${programs.length} active programs** found. Sorted by recent activity.`,
        `Active today: **${activeToday.length}** | Updated this month: **${recentWeek.length}**`,
        ``,
        `| # | Program | Last Activity |`,
        `|---|---------|---------------|`,
        ...lines,
        ``,
        `> Use AUDIT_RECON on a program's GitHub to check code age, audit count, and security posture.`,
        `> Full program list: https://immunefi.com/bug-bounty/`,
      ].join("\n");

      if (callback) await callback({ text: report });
    } catch (err) {
      if (callback) await callback({
        text: `Error fetching Immunefi programs: ${err instanceof Error ? err.message : String(err)}\n\nVisit https://immunefi.com/bug-bounty/ directly.`
      });
    }
  },
  examples: [[
    { name: "user", content: { text: "Show me active bug bounty programs." } },
    { name: "Axiom", content: { text: "## Immunefi Bug Bounty Programs\n\n**249 active programs** found..." } },
  ]],
};
