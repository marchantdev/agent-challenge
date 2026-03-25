/**
 * AUDIT_RECON
 * Fetches recent commits, audit indicators, and repo info from a GitHub repository.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

export const auditReconAction: Action = {
  name: "AUDIT_RECON",
  description: "Fetches recent commits, audit indicators, and security-relevant files from a GitHub repository.",
  similes: ["RECON", "ANALYZE_REPO", "CHECK_AUDITS", "REPO_SCAN", "GITHUB_RECON"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("github") || text.includes("repo") || text.includes("audit") || text.includes("recon");
  },
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const m = text.match(/github\.com\/([\w-]+\/[\w.-]+)/i) || text.match(/\b([\w-]+\/[\w.-]+)\b/);
    if (!m) {
      if (callback) await callback({ text: "Provide a GitHub repo (e.g. `uniswap/v3-core`)." });
      return;
    }
    const repo = m[1].replace(/\.git$/, "");
    try {
      type Commit = { sha: string; commit: { message: string; author: { date: string } } };
      type FileEntry = { name: string };
      type RepoInfo = { description?: string; stargazers_count?: number; pushed_at?: string; language?: string };
      const headers = { "User-Agent": "Axiom/1.0", Accept: "application/vnd.github.v3+json" };
      const base = `https://api.github.com/repos/${repo}`;
      const [cR, tR, rR] = await Promise.all([
        fetch(`${base}/commits?per_page=10`, { headers }),
        fetch(`${base}/contents`, { headers }),
        fetch(base, { headers }),
      ]);
      const commits = cR.ok ? await cR.json() as Commit[] : [];
      const files = tR.ok ? await tR.json() as FileEntry[] : [];
      const info = rR.ok ? await rR.json() as RepoInfo : {};
      const recentCommits = (Array.isArray(commits) ? commits : []).slice(0, 5).map(c =>
        `| \`${c.sha.slice(0, 7)}\` | ${c.commit.message.split("\n")[0].slice(0, 60)} | ${c.commit.author.date.slice(0, 10)} |`);
      const auditFiles = (Array.isArray(files) ? files : []).filter(f => /audit|security|review|findings/i.test(f.name)).map(f => `- \`${f.name}\``);
      const summary = [
        `## Recon: \`${repo}\``,
        `**${info.description || "N/A"}** | Stars: ${info.stargazers_count?.toLocaleString() || "?"} | Last push: ${info.pushed_at?.slice(0, 10) || "?"} | Lang: ${info.language || "?"}`,
        ``,
        `### Audit Indicators`,
        auditFiles.length > 0 ? auditFiles.join("\n") : "- None in repo root",
        ``,
        `### Recent Commits`,
        `| Hash | Message | Date |`,
        `|------|---------|------|`,
        ...recentCommits,
        ``,
        `> Use ASSESS_PROTOCOL_RISK for a risk analysis of the protocol.`,
      ].join("\n");
      if (callback) await callback({ text: summary });
    } catch (err) {
      if (callback) await callback({ text: `Error for \`${repo}\`: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
  examples: [[
    { name: "user", content: { text: "Recon github.com/compound-finance/compound-protocol" } },
    { name: "Axiom", content: { text: "Fetching audit history and recent commits..." } },
  ]],
};
