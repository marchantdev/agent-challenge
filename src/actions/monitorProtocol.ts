/**
 * MONITOR_PROTOCOL
 * Maintains a watchlist of DeFi protocols and alerts on >10% TVL drops.
 *
 * Commands:
 *   "monitor Aave"       / "watch Compound"    → add to watchlist
 *   "check watchlist"    / "monitored protocols" → report TVL status for all
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { formatUsd } from "../utils/api.js";

const DEFILLAMA_API = "https://api.llama.fi";

interface WatchedProtocol {
  name: string;
  slug: string;
  tvlAtAdd: number;
  addedAt: number; // epoch ms
}

// Module-level in-memory watchlist (persists across messages in same process)
const watchlist = new Map<string, WatchedProtocol>();

async function resolveProtocol(name: string): Promise<{ name: string; slug: string; tvl: number } | null> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocols`);
    if (!res.ok) return null;
    const protocols = await res.json() as any[];
    const match = protocols.find((p: any) =>
      p.name.toLowerCase() === name.toLowerCase() ||
      p.slug.toLowerCase() === name.toLowerCase() ||
      p.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!match) return null;
    return { name: match.name as string, slug: match.slug as string, tvl: (match.tvl as number) || 0 };
  } catch {
    return null;
  }
}

async function fetchCurrentTvl(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocol/${slug}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return (data.tvl as number) ?? null;
  } catch {
    return null;
  }
}


function isAddIntent(text: string): boolean {
  return /\b(monitor|watch|track|add|alert)\b/i.test(text) &&
    !/\b(watchlist|monitored|check|status|list|show|report)\b/i.test(text);
}

function isCheckIntent(text: string): boolean {
  return /\b(watchlist|monitored|check watchlist|check monitor|show monitor|list monitor|status monitor|monitored protocols)\b/i.test(text);
}

function extractProtocolName(text: string): string {
  // Strip intent keywords and extract the protocol name
  return text
    .replace(/\b(monitor|watch|track|add|alert|the|protocol|on defi|on-chain|please|can you|could you)\b/gi, "")
    .replace(/[^\w\s.]/g, "")
    .trim();
}

export const monitorProtocolAction: Action = {
  name: "MONITOR_PROTOCOL",
  description: "Add a DeFi protocol to a TVL watchlist or check the status of all watched protocols. Alerts when TVL drops >10% since monitoring started.",
  similes: [
    "WATCH_PROTOCOL", "ADD_WATCHLIST", "CHECK_WATCHLIST",
    "WATCHLIST_STATUS", "PROTOCOL_MONITOR", "TRACK_PROTOCOL",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return isAddIntent(text) || isCheckIntent(text);
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ) => {
    const text = message.content?.text || "";

    // --- CHECK WATCHLIST ---
    if (isCheckIntent(text.toLowerCase())) {
      if (watchlist.size === 0) {
        if (callback) await callback({ text: "Your watchlist is empty. Add protocols with: **monitor Aave**, **watch Compound**, etc." });
        return;
      }

      if (callback) await callback({ text: `Checking live TVL for ${watchlist.size} protocol(s)…` });

      const rows: string[] = [];
      const alerts: string[] = [];

      for (const [key, entry] of watchlist.entries()) {
        const currentTvl = await fetchCurrentTvl(entry.slug);
        if (currentTvl === null) {
          rows.push(`| ${entry.name} | ${formatUsd(entry.tvlAtAdd)} | N/A | ⚠️ Fetch failed |`);
          continue;
        }

        const pctChange = entry.tvlAtAdd > 0
          ? ((currentTvl - entry.tvlAtAdd) / entry.tvlAtAdd) * 100
          : 0;

        const changeStr = `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`;
        const flag = pctChange <= -10 ? "🚨 >10% DROP" : pctChange >= 10 ? "📈 +10%" : "✅ Stable";

        rows.push(`| ${entry.name} | ${formatUsd(entry.tvlAtAdd)} | ${formatUsd(currentTvl)} | ${changeStr} | ${flag} |`);

        if (pctChange <= -10) {
          alerts.push(`🚨 **${entry.name}**: TVL dropped **${Math.abs(pctChange).toFixed(1)}%** since monitoring started (${formatUsd(entry.tvlAtAdd)} → ${formatUsd(currentTvl)}). Possible exploit, large withdrawal, or market stress.`);
        }
      }

      const table = [
        `## Watchlist Status (${new Date().toUTCString()})`,
        ``,
        `| Protocol | TVL at Add | Current TVL | Change | Status |`,
        `|----------|-----------|-------------|--------|--------|`,
        ...rows,
      ].join("\n");

      const alertSection = alerts.length > 0
        ? `\n\n### ⚠️ Anomaly Alerts\n${alerts.join("\n")}`
        : `\n\n*No anomalies detected.*`;

      if (callback) await callback({ text: table + alertSection });
      return;
    }

    // --- ADD TO WATCHLIST ---
    const protocolName = extractProtocolName(text);

    if (!protocolName || protocolName.length < 2) {
      if (callback) await callback({ text: "Please specify a protocol name. Example: **monitor Aave** or **watch Compound**" });
      return;
    }

    const key = protocolName.toLowerCase();
    if (watchlist.has(key)) {
      const existing = watchlist.get(key)!;
      if (callback) await callback({ text: `**${existing.name}** is already on your watchlist (added ${new Date(existing.addedAt).toUTCString()}, TVL at add: ${formatUsd(existing.tvlAtAdd)}).` });
      return;
    }

    if (callback) await callback({ text: `Looking up **${protocolName}** on DefiLlama…` });

    const resolved = await resolveProtocol(protocolName);
    if (!resolved) {
      if (callback) await callback({ text: `Could not find **"${protocolName}"** on DefiLlama. Try the exact name (e.g., "Aave V3", "Lido", "Uniswap V3").` });
      return;
    }

    watchlist.set(key, {
      name: resolved.name,
      slug: resolved.slug,
      tvlAtAdd: resolved.tvl,
      addedAt: Date.now(),
    });

    if (callback) await callback({
      text: [
        `✅ **${resolved.name}** added to watchlist.`,
        ``,
        `- **Current TVL:** ${formatUsd(resolved.tvl)}`,
        `- **Monitoring since:** ${new Date().toUTCString()}`,
        `- **Alert threshold:** >10% TVL drop`,
        ``,
        `Check anytime with: **check watchlist** or **monitored protocols**`,
      ].join("\n"),
    });
  },

  examples: [
    [
      { name: "user", content: { text: "monitor Aave" } },
      { name: "Axiom", content: { text: "✅ **Aave V3** added to watchlist." } },
    ],
    [
      { name: "user", content: { text: "check watchlist" } },
      { name: "Axiom", content: { text: "Checking live TVL for 1 protocol(s)…" } },
    ],
    [
      { name: "user", content: { text: "watch Compound" } },
      { name: "Axiom", content: { text: "✅ **Compound V3** added to watchlist." } },
    ],
  ],
};
