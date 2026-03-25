/**
 * COMPARE_PROTOCOLS
 * Side-by-side security comparison of two DeFi protocols.
 * Uses computeSecurityScore() from assessRisk.ts for both,
 * then generates AI commentary via Nosana-hosted Qwen.
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { computeSecurityScore, type SecurityScore } from "./assessRisk.ts";

function extractProtocolPair(text: string): [string, string] | null {
  // "Compare Aave vs Compound", "Aave versus Lido", "comparison Aave Compound"
  const vsMatch = text.match(/([A-Za-z0-9][A-Za-z0-9\s.]*?)\s+(?:vs\.?|versus)\s+([A-Za-z0-9][A-Za-z0-9\s.]*?)(?:\s+security|\s+risk|\s+comparison|\s*$)/i);
  if (vsMatch) return [vsMatch[1].trim(), vsMatch[2].trim()];

  // "Compare X and Y" / "Compare X Y"
  const compareMatch = text.match(/compare\s+(?:protocols?\s+)?([A-Za-z0-9][A-Za-z0-9\s.]*?)\s+(?:and|with|to|\s)\s*([A-Za-z0-9][A-Za-z0-9\s.]*?)(?:\s+security|\s+risk|\s+comparison|\s*$)/i);
  if (compareMatch) return [compareMatch[1].trim(), compareMatch[2].trim()];

  // Fallback: "comparison X Y"
  const comparisonMatch = text.match(/comparison\s+([A-Za-z0-9][A-Za-z0-9\s.]*?)\s+([A-Za-z0-9][A-Za-z0-9\s.]*?)(?:\s+security|\s+risk|\s*$)/i);
  if (comparisonMatch) return [comparisonMatch[1].trim(), comparisonMatch[2].trim()];

  return null;
}

export const compareProtocolsAction: Action = {
  name: "COMPARE_PROTOCOLS",
  description: "Side-by-side security comparison of two DeFi protocols using live TVL data and security scoring.",
  similes: ["COMPARE_DEFI", "PROTOCOL_COMPARISON", "VS_PROTOCOLS", "COMPARE_SECURITY"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    const hasKeyword = text.includes("compare") || text.includes(" vs ") || text.includes("versus") || text.includes("comparison");
    if (!hasKeyword) return false;
    // Need at least 2 protocol-like words (capitalized or known)
    const pair = extractProtocolPair(message.content?.text || "");
    return pair !== null;
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const pair = extractProtocolPair(text);

    if (!pair) {
      if (callback) await callback({ text: "Please specify two protocols. Example: 'Compare Aave vs Compound'" });
      return;
    }

    const [nameA, nameB] = pair;

    if (callback) await callback({ text: `Comparing **${nameA}** vs **${nameB}** — fetching live data from DefiLlama...` });

    const [scoreA, scoreB] = await Promise.all([
      computeSecurityScore(nameA),
      computeSecurityScore(nameB),
    ]);

    if (!scoreA && !scoreB) {
      if (callback) await callback({ text: `Could not find either "${nameA}" or "${nameB}" on DefiLlama. Try exact protocol names.` });
      return;
    }
    if (!scoreA) {
      if (callback) await callback({ text: `Could not find "${nameA}" on DefiLlama. Try the exact protocol name.` });
      return;
    }
    if (!scoreB) {
      if (callback) await callback({ text: `Could not find "${nameB}" on DefiLlama. Try the exact protocol name.` });
      return;
    }

    const fmt = (s: SecurityScore) => `${s.total}/100`;

    const table = [
      `### Protocol Comparison: ${nameA} vs ${nameB}`,
      ``,
      `| Component | ${nameA} | ${nameB} |`,
      `|-----------|${"-".repeat(nameA.length + 2)}|${"-".repeat(nameB.length + 2)}|`,
      `| Security Score | ${fmt(scoreA)} | ${fmt(scoreB)} |`,
      `| TVL Stability | ${scoreA.tvlStability}/25 | ${scoreB.tvlStability}/25 |`,
      `| Verification | ${scoreA.verification}/25 | ${scoreB.verification}/25 |`,
      `| Maturity | ${scoreA.maturity}/25 | ${scoreB.maturity}/25 |`,
      `| Exploit History | ${scoreA.exploitHistory}/25 | ${scoreB.exploitHistory}/25 |`,
      `| Overall | ${scoreA.riskLabel} | ${scoreB.riskLabel} |`,
    ].join("\n");

    // AI commentary comparing the two
    let aiAnalysis = "";
    try {
      aiAnalysis = await generateText({
        runtime,
        context: `You are Axiom, a DeFi security analyst running on Nosana's decentralised GPU network. Compare these two protocols based on their security scores:\n\n${nameA}: Total ${scoreA.total}/100 (TVL Stability ${scoreA.tvlStability}/25, Verification ${scoreA.verification}/25, Maturity ${scoreA.maturity}/25, Exploit History ${scoreA.exploitHistory}/25) — ${scoreA.riskLabel}\n${nameB}: Total ${scoreB.total}/100 (TVL Stability ${scoreB.tvlStability}/25, Verification ${scoreB.verification}/25, Maturity ${scoreB.maturity}/25, Exploit History ${scoreB.exploitHistory}/25) — ${scoreB.riskLabel}\n\nProvide a 3-4 sentence comparative analysis. Highlight the key differences, which protocol is stronger in which areas, and any actionable insights for a DeFi user choosing between them. Be specific, not generic.`,
        modelClass: ModelClass.LARGE,
      });
    } catch { /* LLM unavailable — table stands alone */ }

    const output = [
      table,
      aiAnalysis ? `\n### AI Analysis (Qwen via Nosana)\n${aiAnalysis}` : "",
      `\n> Use \`ASSESS_PROTOCOL_RISK\` for a detailed single-protocol breakdown.`,
    ].join("\n");

    if (callback) await callback({ text: output });
  },
  examples: [[
    { name: "user", content: { text: "Compare Aave vs Compound" } },
    { name: "Axiom", content: { text: "Comparing **Aave** vs **Compound** — fetching live data from DefiLlama..." } },
  ]],
};
