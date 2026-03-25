/**
 * ASSESS_PROTOCOL_RISK
 * Performs a real-time risk assessment of a DeFi protocol by fetching
 * TVL data from DefiLlama and analyzing across 5 risk categories.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

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
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    // Extract protocol name — look for known patterns
    const nameMatch = text.match(/(?:risk|assess|analyze|security|safe)\s+(?:of\s+)?(?:the\s+)?([A-Za-z0-9\s.]+?)(?:\s+protocol|\s+v\d|\s*$)/i)
      || text.match(/(?:is\s+)([A-Za-z0-9\s.]+?)(?:\s+safe|\s+risky|\s+secure)/i);

    let protocolName = nameMatch ? nameMatch[1].trim() : text.replace(/\b(assess|risk|analyze|protocol|the|of|how|is|safe|secure|security)\b/gi, "").trim();

    if (!protocolName) {
      if (callback) await callback({ text: "Please specify a protocol name. Example: 'Assess the risk of Aave V3'" });
      return;
    }

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

    const formatUsd = (n: number) => n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1e3).toFixed(0)}K`;

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
      `### Risk Categories`,
      risks.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      ``,
      `> Use INSPECT_CONTRACT with a specific address for deeper on-chain analysis.`,
    ].join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Assess the risk of Aave V3" } },
    { name: "Axiom", content: { text: "Analyzing Aave V3 risk profile using live DefiLlama data..." } },
  ]],
};
