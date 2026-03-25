/**
 * EXPLAIN_VULNERABILITY
 *
 * AI-powered DeFi vulnerability explainer with real verified exploit examples.
 *
 * Flow:
 *   1. Detects the vulnerability type from the user's message using the
 *      {@link VULN_KEYWORDS} map (reentrancy, flash loan, oracle, bridge,
 *      access control, integer overflow, front running / MEV).
 *   2. Fetches the DeFiLlama hacks database (cached for 1 hour) and filters
 *      for exploits whose technique matches the detected vulnerability type.
 *   3. Passes the filtered real-world examples plus the detected type to
 *      `runtime.useModel` (Qwen3.5-27B-AWQ-4bit running on Nosana GPU).
 *   4. The LLM generates a comprehensive briefing covering: attack mechanism,
 *      real recent examples, a vulnerable Solidity code snippet, and mitigations.
 *   5. Falls back to a structured list of verified exploits if LLM is unavailable.
 *
 * Data sources: DeFiLlama Hacks API (`api.llama.fi/hacks`, 1h cache),
 * Nosana-hosted Qwen LLM for explanation generation.
 *
 * @module explainVuln
 */

import { ModelType } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { CURATED_EXPLOITS } from "../data/curatedExploits.js";

interface Exploit {
  name: string;
  date: string;
  amount: number;
  technique: string;
}

// Cache hacks data for 1 hour
let hacksCache: { data: Exploit[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Load exploits from DeFiLlama (live) or curated dataset (fallback) */
async function loadExploits(): Promise<Exploit[]> {
  if (hacksCache && Date.now() - hacksCache.fetchedAt < CACHE_TTL_MS) {
    return hacksCache.data;
  }

  try {
    const res = await fetch("https://api.llama.fi/hacks", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    // Paywall detection: valid response is a JSON array
    if (!text.trimStart().startsWith("[")) {
      throw new Error("API returned non-array response (possible paywall)");
    }

    const raw = JSON.parse(text) as Array<{
      date: number; name: string; technique?: string; amount?: number;
    }>;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("Empty response");

    const data = raw
      .filter((e) => e.amount && e.amount > 0)
      .map((e) => ({
        name: e.name,
        date: new Date(e.date * 1000).toISOString().slice(0, 10),
        amount: e.amount ?? 0,
        technique: e.technique ?? "unknown",
      }))
      .sort((a, b) => b.amount - a.amount);

    hacksCache = { fetchedAt: Date.now(), data };
    return data;
  } catch {
    // Fallback to curated dataset
    const fallback = CURATED_EXPLOITS.map((e) => ({
      name: e.name,
      date: e.date,
      amount: e.amount,
      technique: e.technique,
    })).sort((a, b) => b.amount - a.amount);
    hacksCache = { fetchedAt: Date.now(), data: fallback };
    return fallback;
  }
}

async function fetchRecentExploits(vulnType: string): Promise<Exploit[]> {
  const allExploits = await loadExploits();

  // Filter exploits relevant to the vulnerability type
  const keywords = vulnType.toLowerCase().split(/\s+/);
  return allExploits
    .filter((e) => keywords.some((k) => e.technique.toLowerCase().includes(k) || e.name.toLowerCase().includes(k)))
    .slice(0, 5);
}

const VULN_KEYWORDS: Record<string, string[]> = {
  reentrancy: ["reentrancy", "reentrance", "re-entry", "re-entrancy"],
  "flash loan": ["flash loan", "flashloan", "flash-loan", "flash"],
  oracle: ["oracle", "price manipulation", "price feed", "twap"],
  bridge: ["bridge", "cross-chain", "crosschain", "relay", "validator"],
  "access control": ["access control", "authorization", "privilege", "permission", "ownable"],
  "integer overflow": ["overflow", "underflow", "integer", "arithmetic", "unchecked"],
  "front running": ["front run", "frontrun", "mev", "sandwich", "mempool"],
};

function detectVulnType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(VULN_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return null;
}

export const explainVulnAction: Action = {
  name: "EXPLAIN_VULNERABILITY",
  description: "Explains DeFi vulnerability types with real exploit examples, code patterns, and mitigation strategies — generated live by Qwen via Nosana.",
  similes: ["EXPLAIN_VULN", "VULNERABILITY", "ATTACK_VECTOR", "EXPLOIT_TYPE", "SECURITY_BRIEF"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("vulnerab") || text.includes("exploit") || text.includes("attack") ||
           text.includes("reentrancy") || text.includes("flash loan") || text.includes("oracle") ||
           text.includes("bridge") || text.includes("access control") || text.includes("overflow") ||
           text.includes("front run") || text.includes("mev") || text.includes("explain");
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const vulnType = detectVulnType(text);

    if (!vulnType) {
      const types = Object.keys(VULN_KEYWORDS).map((t) => `- **${t}**`).join("\n");
      if (callback) await callback({
        text: `## Available Vulnerability Explainers\n\n${types}\n\nSpecify a vulnerability type. Example: "Explain reentrancy attacks"`
      });
      return;
    }

    if (callback) await callback({ text: `Generating explanation for **${vulnType}** attacks...` });

    // Fetch relevant real-world examples from DeFiLlama
    const recentExploits = await fetchRecentExploits(vulnType);
    const exploitContext = recentExploits.length > 0
      ? `Recent DeFiLlama-verified ${vulnType} exploits (sorted by size):\n` +
        recentExploits.map((e) =>
          `- ${e.name} (${e.date}): $${(e.amount / 1e6).toFixed(1)}M — technique: ${e.technique}`
        ).join("\n")
      : `No exact technique matches found in DeFiLlama — use your training knowledge for real-world examples.`;

    const prompt = `You are Axiom, a DeFi security expert running on Nosana's decentralised GPU network.

A user asked: "${text}"
Detected vulnerability type: ${vulnType}

${exploitContext}

Generate a comprehensive security briefing covering:
1. **How it works** — explain the attack mechanism clearly, step by step
2. **Real recent examples** — reference the DeFiLlama data above where relevant, plus any other well-known historical examples you know
3. **Vulnerable code pattern** — show a short Solidity snippet demonstrating the vulnerable pattern
4. **Mitigation strategies** — concrete, actionable defences (code patterns, tools, best practices)

Be specific and technical. This is for a DeFi security analyst. Format with markdown headers.`;

    try {
      const explanation = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      }) as string;
      if (callback) await callback({ text: explanation });
    } catch (err) {
      // Fallback: structured prompt without LLM
      if (callback) await callback({
        text: `## ${vulnType.charAt(0).toUpperCase() + vulnType.slice(1)} Attack\n\n` +
              `LLM generation failed. Here are the top verified ${vulnType} exploits from DeFiLlama:\n\n` +
              (recentExploits.length > 0
                ? recentExploits.map((e) => `- **${e.name}** (${e.date}): $${(e.amount / 1e6).toFixed(1)}M`).join("\n")
                : "No matching exploits found in DeFiLlama database.") +
              `\n\n> Use ASSESS_PROTOCOL_RISK on a specific protocol to check for ${vulnType} patterns.`
      });
    }
  },
  examples: [[
    { name: "user", content: { text: "Explain flash loan attacks" } },
    { name: "Axiom", content: { text: "Generating explanation for **flash loan** attacks..." } },
  ]],
};
