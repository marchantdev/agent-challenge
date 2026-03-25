/**
 * ASSESS_PROTOCOL_RISK
 *
 * AI-powered DeFi protocol risk assessment with composite Security Score.
 *
 * Flow:
 *   1. Parses the protocol name from the user's message.
 *   2. Fetches live TVL, 24h/7d change, chain list, and category from DefiLlama.
 *   3. Computes a composite Security Score (0-100) from four data-driven components:
 *      - TVL Stability (0-25): based on 24h/7d TVL change
 *      - Verification Status (0-25): Etherscan source code verification
 *      - Protocol Maturity (0-25): time since listing on DefiLlama
 *      - Exploit History (0-25): cross-referenced against DefiLlama /hacks
 *   4. Runs a rule-based risk scorer (smart contract, economic, concentration,
 *      volatility, oracle) to produce structured risk flags.
 *   5. Calls `runtime.useModel` with the Qwen3.5-27B-AWQ-4bit model (running on
 *      Nosana GPU) to generate a 3–4 sentence expert commentary.
 *   6. Returns a markdown report: Security Score first, then metrics, flags, AI analysis.
 *
 * Data sources: DefiLlama /protocols, DefiLlama /hacks, Etherscan getsourcecode,
 *               Nosana-hosted Qwen LLM.
 *
 * @module assessRisk
 */

import { ModelType } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { formatUsd, cachedFetch } from "../utils/api.js";

const DEFILLAMA_API = "https://api.llama.fi";
const ETHERSCAN_API = "https://api.etherscan.io/v2/api";

interface SecurityScore {
  total: number;
  tvlStability: number;
  verification: number;
  maturity: number;
  exploitHistory: number;
  label: "Low Risk" | "Moderate Risk" | "Elevated Risk" | "High Risk";
  emoji: string;
}

export async function computeSecurityScore(protocol: any): Promise<SecurityScore> {
  // --- Component 1: TVL Stability (0-25) ---
  // Penalise large swings in 24h or 7d TVL
  const change1d = Math.abs(protocol.change_1d ?? 0);
  const change7d = Math.abs(protocol.change_7d ?? 0);
  let tvlStability: number;
  if (change1d > 10 || change7d > 25) tvlStability = 0;
  else if (change1d > 5 || change7d > 15) tvlStability = 8;
  else if (change1d > 2 || change7d > 7) tvlStability = 16;
  else tvlStability = 25;

  // --- Component 2: Verification Status (0-25) ---
  // Check if primary contract is source-verified on Etherscan
  let verification = 10; // default: unknown / no address
  const rawAddress = protocol.address;
  if (rawAddress) {
    // Address may be plain "0x..." or prefixed "ethereum:0x..."
    const addr = rawAddress.includes(":") ? rawAddress.split(":")[1] : rawAddress;
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
      try {
        const apiKey = process.env.ETHERSCAN_API_KEY || "";
        const url = `${ETHERSCAN_API}?chainid=1&module=contract&action=getsourcecode&address=${addr}&apikey=${apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json() as any;
          const source = json?.result?.[0]?.SourceCode;
          verification = (json.status === "1" && source && source !== "") ? 25 : 5;
        }
      } catch { /* keep default */ }
    }
  }

  // --- Component 3: Protocol Maturity (0-25) ---
  // Older protocols are better-battle-tested
  let maturity: number;
  const listedAt = protocol.listedAt as number | undefined;
  if (listedAt) {
    const ageMonths = (Date.now() - listedAt * 1000) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths >= 12) maturity = 25;
    else if (ageMonths >= 6) maturity = 18;
    else if (ageMonths >= 3) maturity = 12;
    else if (ageMonths >= 1) maturity = 8;
    else maturity = 5;
  } else {
    maturity = 10; // unknown listing date
  }

  // --- Component 4: Exploit History (0-25) ---
  // Cross-reference DefiLlama /hacks; penalise recent exploits more
  let exploitHistory = 25;
  try {
    const hacks = await cachedFetch(`${DEFILLAMA_API}/hacks`);
    if (Array.isArray(hacks)) {
      const nameLower = protocol.name.toLowerCase();
      const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
      const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

      const related = hacks.filter((h: any) =>
        h.name?.toLowerCase().includes(nameLower) || nameLower.includes(h.name?.toLowerCase() ?? "___")
      );

      if (related.length > 0) {
        // date field is Unix timestamp (seconds)
        const mostRecentMs = Math.max(...related.map((h: any) => (h.date as number) * 1000));
        if (mostRecentMs > sixMonthsAgo) exploitHistory = 0;
        else if (mostRecentMs > twoYearsAgo) exploitHistory = 8;
        else exploitHistory = 15; // old exploit, partially discounted
      }
    }
  } catch { /* keep default */ }

  const total = tvlStability + verification + maturity + exploitHistory;

  let label: SecurityScore["label"];
  let emoji: string;
  if (total >= 80) { label = "Low Risk"; emoji = "🟢"; }
  else if (total >= 60) { label = "Moderate Risk"; emoji = "🟡"; }
  else if (total >= 40) { label = "Elevated Risk"; emoji = "🟠"; }
  else { label = "High Risk"; emoji = "🔴"; }

  return { total, tvlStability, verification, maturity, exploitHistory, label, emoji };
}

async function fetchProtocolData(name: string): Promise<any | null> {
  try {
    const protocols = await cachedFetch(`${DEFILLAMA_API}/protocols`) as any[];
    const match = protocols.find((p: any) =>
      p.name.toLowerCase() === name.toLowerCase() ||
      p.slug.toLowerCase() === name.toLowerCase()
    );
    return match || null;
  } catch { return null; }
}

/* computeSecurityScore is already exported inline at its definition */

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
    const audits = parseInt(data.audits || "0", 10);
    const risks = assessRiskLevel(tvl, change1d, audits, chains);

    // Compute Security Score from real API data (NOT LLM-generated)
    const score = await computeSecurityScore(data);

    // Generate AI-powered expert commentary via Nosana-hosted Qwen model
    const dataContext = `Protocol: ${data.name} | Category: ${category} | TVL: ${formatUsd(tvl)} | Security Score: ${score.total}/100 (${score.label}) | Chains: ${(data.chains || []).join(", ")} | 24h: ${change1d !== null ? change1d.toFixed(2) + "%" : "N/A"} | 7d: ${change7d !== null ? change7d.toFixed(2) + "%" : "N/A"} | Flags: ${risks.join("; ")}`;

    let aiCommentary = "";
    try {
      aiCommentary = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: `You are Axiom, a DeFi security analyst running on Nosana's decentralised GPU network. Based on these live metrics for ${data.name}, provide a 3-4 sentence expert security commentary. Be specific about the key risks, what to watch for, and any actionable conclusions. Do not repeat the raw numbers — interpret them.\n\nData: ${dataContext}`,
      }) as string;
    } catch { /* LLM unavailable — fallback to structured report */ }

    const report = [
      `## Risk Assessment: ${data.name}`,
      ``,
      `### ${score.emoji} Security Score: ${score.total}/100 — ${score.label}`,
      `| Component | Score | Max |`,
      `|-----------|------:|----:|`,
      `| TVL Stability | ${score.tvlStability} | 25 |`,
      `| Verification Status | ${score.verification} | 25 |`,
      `| Protocol Maturity | ${score.maturity} | 25 |`,
      `| Exploit History | ${score.exploitHistory} | 25 |`,
      `| **Total** | **${score.total}** | **100** |`,
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
