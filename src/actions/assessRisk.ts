/**
 * ASSESS_PROTOCOL_RISK
 *
 * AI-powered DeFi protocol risk assessment.
 *
 * Flow:
 *   1. Parses the protocol name from the user's message.
 *   2. Fetches live TVL, 24h/7d change, chain list, and category from DefiLlama.
 *   3. Runs a rule-based risk scorer (smart contract, economic, concentration,
 *      volatility, oracle) to produce structured risk flags.
 *   4. Calls {@link generateText} with the Qwen3.5-27B-AWQ-4bit model (running on
 *      Nosana GPU) to generate a 3–4 sentence expert commentary that interprets
 *      the raw metrics rather than repeating them.
 *   5. Returns a markdown report with a metrics table, risk flags, and AI analysis.
 *
 * Data sources: DefiLlama `/protocols` endpoint, Nosana-hosted Qwen LLM.
 * Falls back to structured report only if LLM is unavailable.
 *
 * @module assessRisk
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { formatUsd } from "../utils/api.js";

const DEFILLAMA_API = "https://api.llama.fi";

async function fetchProtocolData(name: string): Promise<any | null> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocols`);
    if (!res.ok) return null;
    const protocols = await res.json() as any[];
    const match = protocols.find((p: any) =>
      p.name.toLowerCase() === name.toLowerCase() ||
      p.slug.toLowerCase() === name.toLowerCase()
    );
    return match || null;
  } catch { return null; }
}

function assessRiskLevel(tvl: number, change1d: number | null, audits: number, chains: number): string[] {
  const risks: string[] = [];

  // Smart contract risk
  if (audits === 0) risks.push("**Smart Contract: HIGH** — No known audits. Code may contain undiscovered vulnerabilities.");
  else if (audits <= 2) risks.push("**Smart Contract: MEDIUM** — Limited audit coverage. New deployments may not be fully reviewed.");
  else risks.push("**Smart Contract: LOW** — Multiple audits completed.");

  // Economic risk
  if (tvl < 1_000_000) risks.push("**Economic: HIGH** — Low TVL ($" + (tvl / 1e6).toFixed(1) + "M). Thin liquidity increases manipulation risk.");
  else if (tvl < 100_000_000) risks.push("**Economic: MEDIUM** — Moderate TVL. Large trades may impact pricing.");
  else risks.push("**Economic: LOW** — Deep liquidity and established protocol.");

  // Concentration risk
  if (chains <= 1) risks.push("**Concentration: MEDIUM** — Single-chain deployment. Chain-specific risks apply.");
  else risks.push("**Concentration: LOW** — Multi-chain deployment across " + chains + " chains.");

  // Volatility risk
  if (change1d !== null && Math.abs(change1d) > 10) risks.push("**Volatility: HIGH** — TVL changed " + change1d.toFixed(1) + "% in 24h. Possible instability or exploit.");
  else if (change1d !== null && Math.abs(change1d) > 3) risks.push("**Volatility: MEDIUM** — TVL shifted " + change1d.toFixed(1) + "% in 24h.");
  else risks.push("**Volatility: LOW** — Stable TVL over 24h.");

  // Oracle risk (generic — can't determine without contract analysis)
  risks.push("**Oracle: UNKNOWN** — Requires contract-level analysis to assess oracle dependencies.");

  return risks;
}

export const assessRiskAction: Action = {
  name: "ASSESS_PROTOCOL_RISK",
  description: "Performs a real-time risk assessment of a DeFi protocol using TVL data, chain exposure, and volatility metrics.",
  similes: ["ASSESS_RISK", "RISK_ASSESSMENT", "ANALYZE_PROTOCOL", "PROTOCOL_RISK", "CHECK_RISK"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("risk") || text.includes("assess") || text.includes("analyze") ||
           text.includes("safe") || text.includes("security") || text.includes("how secure");
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const nameMatch = text.match(/(?:risk|assess|analyze|security|safe)\s+(?:of\s+)?(?:the\s+)?([A-Za-z0-9\s.]+?)(?:\s+protocol|\s+v\d|\s*$)/i)
      || text.match(/(?:is\s+)([A-Za-z0-9\s.]+?)(?:\s+safe|\s+risky|\s+secure)/i);

    let protocolName = nameMatch ? nameMatch[1].trim() : text.replace(/\b(assess|risk|analyze|protocol|the|of|how|is|safe|secure|security)\b/gi, "").trim();

    if (!protocolName) {
      if (callback) await callback({ text: "Please specify a protocol name. Example: 'Assess the risk of Aave V3'" });
      return;
    }

    if (callback) await callback({ text: `Fetching live data for **${protocolName}** from DefiLlama...` });

    const data = await fetchProtocolData(protocolName);

    if (!data) {
      if (callback) await callback({
        text: `Could not find "${protocolName}" on DefiLlama. Try the exact protocol name (e.g., "Aave V3", "Lido", "Uniswap V3").`
      });
      return;
    }

    const tvl = data.tvl || 0;
    const change1d = data.change_1d ?? null;
    const change7d = data.change_7d ?? null;
    const chains = (data.chains || []).length;
    const category = data.category || "Unknown";
    const risks = assessRiskLevel(tvl, change1d, data.audits || 0, chains);


    // Generate AI-powered expert commentary via Nosana-hosted Qwen model
    const dataContext = `Protocol: ${data.name} | Category: ${category} | TVL: ${formatUsd(tvl)} | Chains: ${(data.chains || []).join(", ")} | 24h: ${change1d !== null ? change1d.toFixed(2) + "%" : "N/A"} | 7d: ${change7d !== null ? change7d.toFixed(2) + "%" : "N/A"} | Flags: ${risks.join("; ")}`;

    let aiCommentary = "";
    try {
      aiCommentary = await generateText({
        runtime,
        context: `You are Axiom, a DeFi security analyst running on Nosana's decentralised GPU network. Based on these live metrics for ${data.name}, provide a 3-4 sentence expert security commentary. Be specific about the key risks, what to watch for, and any actionable conclusions. Do not repeat the raw numbers — interpret them.\n\nData: ${dataContext}`,
        modelClass: ModelClass.LARGE,
      });
    } catch { /* LLM unavailable — fallback to structured report */ }

    const report = [
      `## Risk Assessment: ${data.name}`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| TVL | ${formatUsd(tvl)} |`,
      `| Category | ${category} |`,
      `| Chains | ${(data.chains || []).join(", ") || "Unknown"} |`,
      `| 24h Change | ${change1d !== null ? change1d.toFixed(2) + "%" : "N/A"} |`,
      `| 7d Change | ${change7d !== null ? change7d.toFixed(2) + "%" : "N/A"} |`,
      ``,
      `### Risk Flags`,
      risks.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      aiCommentary ? `\n### AI Analysis (Qwen via Nosana)\n${aiCommentary}` : "",
      ``,
      `> Use INSPECT_CONTRACT with a contract address for deeper on-chain analysis.`,
    ].filter(l => l !== undefined).join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Assess the risk of Aave V3" } },
    { name: "Axiom", content: { text: "Fetching live data for **Aave V3** from DefiLlama..." } },
  ]],
};
