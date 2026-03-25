/**
 * NOSANA_STATUS
 * Reports on the Nosana decentralized GPU network and the agent's own deployment health.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

export const nosanaStatusAction: Action = {
  name: "NOSANA_STATUS",
  description: "Reports Nosana network status, the agent's deployment health, and decentralized infrastructure metrics.",
  similes: ["NOSANA", "INFRASTRUCTURE", "DEPLOYMENT", "GPU_STATUS", "WHERE_DO_YOU_RUN", "NETWORK_STATUS"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("nosana") || text.includes("infrastructure") || text.includes("where") ||
           text.includes("gpu") || text.includes("deployment") || text.includes("network") ||
           text.includes("run");
  },
  handler: async (_runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const uptimeStr = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const memUsage = process.memoryUsage();
    const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(0);

    const nodeId = process.env.NOSANA_NODE_ID || "local-dev";
    const model = "Qwen3.5-27B-AWQ-4bit";

    // Attempt to fetch Nosana network info
    let networkInfo = "";
    try {
      const res = await fetch("https://api.nosana.com/nodes", { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json() as any;
        const nodeCount = Array.isArray(data) ? data.length : data.total || "Unknown";
        networkInfo = `\n### Nosana Network\n| Metric | Value |\n|--------|-------|\n| Total Nodes | ${nodeCount} |\n| Network | Solana Mainnet |\n| Token | NOS |`;
      }
    } catch {
      networkInfo = "\n### Nosana Network\n> Network stats temporarily unavailable. Nosana runs on Solana mainnet with distributed GPU nodes.";
    }

    const report = [
      `## Axiom Infrastructure Status`,
      ``,
      `I'm running on **Nosana's decentralized GPU network** — a Solana-based compute marketplace. This means my inference runs on community-operated GPU nodes, not centralized cloud providers.`,
      ``,
      `### Agent Deployment`,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Node ID | \`${nodeId}\` |`,
      `| Model | ${model} |`,
      `| Uptime | ${uptimeStr} |`,
      `| Memory (Heap) | ${heapMB} MB |`,
      `| Memory (RSS) | ${rssMB} MB |`,
      `| Container | \`ghcr.io/marchantdev/agent-challenge:latest\` |`,
      `| GPU Market | NVIDIA RTX 3090 |`,
      `| Framework | ElizaOS v1 + Custom Security Plugin |`,
      `| Frontend | Custom React Dashboard (port 8080) |`,
      networkInfo,
      ``,
      `### Why Decentralized?`,
      `Security infrastructure that runs on AWS/GCP has a single point of failure. If the cloud provider is compromised, rate-limits your API, or censors your analysis — the tool stops working. Nosana distributes compute across independent node operators. No single entity controls the infrastructure.`,
      ``,
      `> This is the same trustless ethos as the DeFi protocols I protect.`,
    ].join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Where do you run?" } },
    { name: "Axiom", content: { text: "I run on Nosana's decentralized GPU network..." } },
  ]],
};
