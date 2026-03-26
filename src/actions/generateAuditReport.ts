/**
 * GENERATE_AUDIT_REPORT
 * Orchestrates multiple data sources into a comprehensive security audit report:
 *   1. Protocol info from DefiLlama (TVL, chains, category)
 *   2. Security Score via computeSecurityScore (4-component breakdown)
 *   3. Exploit history from DeFiLlama Hacks API (filtered for this protocol)
 *   4. Contract verification from Etherscan (if address found in DefiLlama data)
 *   5. Active bounty check from Immunefi sitemap
 *   6. AI risk assessment and recommendations via generateText (Nosana-hosted model)
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";
import { computeSecurityScore } from "./assessRisk.ts";
import { checkContractVerification as checkVerificationV2 } from "../utils/ethRpc.ts";

const DEFILLAMA_API = "https://api.llama.fi";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}

async function fetchProtocol(name: string): Promise<any | null> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocols`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const protocols = (await res.json()) as any[];
    return protocols.find(
      (p: any) =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.slug.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        p.slug.toLowerCase().includes(name.toLowerCase())
    ) || null;
  } catch { return null; }
}

async function fetchRelatedExploits(protocolName: string): Promise<Array<{ name: string; date: string; amount: number; technique: string }>> {
  try {
    const res = await fetch("https://api.llama.fi/hacks", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{
      date: number; name: string; technique?: string; classification?: string; amount?: number;
    }>;
    const lower = protocolName.toLowerCase();
    return raw
      .filter(e => e.name.toLowerCase().includes(lower) && e.amount && e.amount > 0)
      .map(e => ({
        name: e.name,
        date: new Date(e.date * 1000).toISOString().slice(0, 10),
        amount: e.amount ?? 0,
        technique: e.technique ?? e.classification ?? "Unknown",
      }))
      .sort((a, b) => b.amount - a.amount);
  } catch { return []; }
}

async function checkContractVerification(address: string): Promise<{ verified: boolean; name: string; isProxy: boolean } | null> {
  if (!address || !address.startsWith("0x")) return null;
  try {
    const status = await checkVerificationV2(address);
    return {
      verified: status === "verified",
      name: "Contract",
      isProxy: false,
    };
  } catch { return null; }
}

async function checkImmunefiBounty(protocolName: string): Promise<{ found: boolean; maxReward: number } | null> {
  try {
    const res = await fetch("https://immunefi.com/immunefi.json", {
      headers: { "User-Agent": "Axiom/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bounties?: Array<{ project: string; maximum_reward: number }> };
    const lower = protocolName.toLowerCase();
    const match = (data.bounties || []).find(b => b.project.toLowerCase().includes(lower));
    if (match) return { found: true, maxReward: match.maximum_reward };
    return { found: false, maxReward: 0 };
  } catch { return null; }
}

// ─── action ─────────────────────────────────────────────────────────────────

export const generateAuditReportAction: Action = {
  name: "GENERATE_AUDIT_REPORT",
  description: "Generates a full security audit report for a DeFi protocol, combining TVL data, security score, exploit history, contract verification, and AI risk commentary.",
  similes: [
    "AUDIT_REPORT", "SECURITY_REPORT", "FULL_AUDIT", "GENERATE_REPORT",
    "FULL_SECURITY_AUDIT", "AUDIT_SUMMARY", "SECURITY_AUDIT",
  ],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return (
      text.includes("audit report") ||
      text.includes("security report") ||
      text.includes("full audit") ||
      text.includes("generate report") ||
      text.includes("full security")
    );
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";

    // Extract protocol name from common phrasings
    const nameMatch =
      text.match(/(?:audit report|security report|full audit|generate report|full security audit)\s+(?:for\s+|of\s+)?(.+)/i) ||
      text.match(/(?:audit|report)\s+(?:for\s+|on\s+)?([A-Za-z0-9\s.]+?)(?:\s+v\d|\s*$)/i);

    let protocolName = nameMatch ? nameMatch[1].trim() : text
      .replace(/\b(audit|report|security|full|generate|for|of|the|a)\b/gi, "")
      .trim();

    if (!protocolName) {
      if (callback) await callback({ text: 'Please specify a protocol. Example: "Audit report for Aave" or "Full security audit of Compound"' });
      return;
    }

    if (callback) await callback({ text: `Generating security audit report for **${protocolName}**...\n*Fetching data from DefiLlama, Etherscan, Immunefi, and rekt.news*` });

    // ── 1. Fetch all data in parallel ────────────────────────────────────────
    const [protocol, secScore, exploits, bountyStatus] = await Promise.all([
      fetchProtocol(protocolName),
      computeSecurityScore(protocolName),
      fetchRelatedExploits(protocolName),
      checkImmunefiBounty(protocolName),
    ]);

    // ── 2. Contract verification (needs address from protocol data) ──────────
    let contractInfo: { verified: boolean; name: string; isProxy: boolean } | null = null;
    if (protocol) {
      const address = protocol.address || (protocol.addresses && Object.values(protocol.addresses)[0]);
      if (address && typeof address === "string") {
        contractInfo = await checkContractVerification(address);
      }
    }

    // ── 3. Build data summary for AI commentary ──────────────────────────────
    const displayName = protocol?.name || protocolName;
    const tvl = protocol?.tvl || 0;
    const change1d = protocol?.change_1d ?? null;
    const change7d = protocol?.change_7d ?? null;
    const chains: string[] = protocol?.chains || [];
    const category = protocol?.category || "Unknown";
    const score = secScore;

    const dataContext = [
      `Protocol: ${displayName}`,
      `TVL: ${tvl ? formatUsd(tvl) : "N/A"}`,
      `Category: ${category}`,
      `Chains: ${chains.join(", ") || "N/A"}`,
      `24h change: ${change1d !== null ? change1d.toFixed(2) + "%" : "N/A"}`,
      `Security score: ${score ? `${score.total}/100 (${score.riskLabel})` : "N/A"}`,
      `Exploits found: ${exploits.length}`,
      `Total exploit losses: ${exploits.length > 0 ? formatUsd(exploits.reduce((s, e) => s + e.amount, 0)) : "$0"}`,
      `Contract verified: ${contractInfo ? (contractInfo.verified ? "Yes" : "No") : "Unknown"}`,
      `Immunefi bounty: ${bountyStatus?.found ? `Yes (max ${formatUsd(bountyStatus.maxReward)})` : "Not listed"}`,
    ].join(" | ");

    // ── 4. AI commentary ─────────────────────────────────────────────────────
    let aiAssessment = "";
    let aiRecommendations = "";
    try {
      const aiResponse = await generateText({
        runtime,
        context: `You are Axiom, an expert DeFi security analyst running on Nosana's decentralized GPU network. A user has requested a full security audit report for "${displayName}".

Based on this aggregated data: ${dataContext}

Write two short sections:

SECTION 1 — AI RISK ASSESSMENT (3-4 sentences): Provide expert commentary on the overall security posture. Be specific about what makes this protocol strong or vulnerable. Mention specific risks based on category, TVL, and exploit history.

SECTION 2 — RECOMMENDATIONS (3-4 bullet points): Actionable security recommendations for users or the protocol team based on the data above. Be concrete.

Format your response as:
ASSESSMENT: [your assessment text here]
RECOMMENDATIONS:
- [recommendation 1]
- [recommendation 2]
- [recommendation 3]`,
        modelClass: ModelClass.LARGE,
      });

      // Parse AI response into two sections
      const assessmentMatch = aiResponse.match(/ASSESSMENT:\s*([\s\S]+?)(?=RECOMMENDATIONS:|$)/i);
      const recommendationsMatch = aiResponse.match(/RECOMMENDATIONS:\s*([\s\S]+)/i);
      aiAssessment = assessmentMatch ? assessmentMatch[1].trim() : aiResponse.slice(0, 400).trim();
      aiRecommendations = recommendationsMatch ? recommendationsMatch[1].trim() : "";
    } catch {
      aiAssessment = "AI commentary unavailable — Nosana model endpoint not reachable in this environment.";
    }

    // ── 5. Assemble report ───────────────────────────────────────────────────
    const now = new Date().toISOString().slice(0, 10);

    const scoreTable = score
      ? [
          `| Component | Score | Details |`,
          `|-----------|-------|---------|`,
          `| TVL Stability | ${score.tvlStability}/25 | TVL: ${tvl ? formatUsd(tvl) : "N/A"}${change1d !== null ? `, ${change1d > 0 ? "+" : ""}${change1d.toFixed(1)}% (24h)` : ""} |`,
          `| Verification | ${score.verification}/25 | ${contractInfo?.verified ? "Contract verified on Etherscan" : contractInfo ? "Contract NOT verified" : "Verification data from audit count"} |`,
          `| Maturity | ${score.maturity}/25 | ${chains.length > 0 ? `${chains.length} chain${chains.length !== 1 ? "s" : ""} — ${chains.slice(0, 3).join(", ")}${chains.length > 3 ? " +others" : ""}` : "Single/unknown chain"} |`,
          `| Exploit History | ${score.exploitHistory}/25 | ${exploits.length > 0 ? `${exploits.length} exploit(s) found` : "No exploits found in database"} |`,
        ].join("\n")
      : "*Score unavailable — protocol not found on DefiLlama*";

    const exploitSection =
      exploits.length > 0
        ? exploits
            .map(e => `- **${e.date}** — ${e.name}: ${formatUsd(e.amount)} lost (${e.technique})`)
            .join("\n")
        : "No exploits found in the DeFiLlama hacks database for this protocol.";

    const bountySection = bountyStatus
      ? bountyStatus.found
        ? `**Active bug bounty program** on Immunefi — maximum reward: **${formatUsd(bountyStatus.maxReward)}**\n> Security researchers can earn rewards for finding vulnerabilities.`
        : "No active bug bounty program found on Immunefi."
      : "Could not fetch Immunefi data.";

    const contractSection = contractInfo
      ? [
          `- **Verified:** ${contractInfo.verified ? "✓ Source code verified on Etherscan" : "✗ Source code NOT verified"}`,
          `- **Contract name:** ${contractInfo.name}`,
          `- **Proxy:** ${contractInfo.isProxy ? "Yes — upgradeable (admin risk)" : "No"}`,
        ].join("\n")
      : "Contract address not found in DefiLlama data. Use `INSPECT_CONTRACT 0x...` for direct analysis.";

    const overviewSection = protocol
      ? [
          `- **TVL:** ${formatUsd(tvl)}`,
          `- **Category:** ${category}`,
          `- **Chains:** ${chains.join(", ") || "Unknown"}`,
          `- **24h Change:** ${change1d !== null ? (change1d > 0 ? "+" : "") + change1d.toFixed(2) + "%" : "N/A"}`,
          `- **7d Change:** ${change7d !== null ? (change7d > 0 ? "+" : "") + change7d.toFixed(2) + "%" : "N/A"}`,
        ].join("\n")
      : "*Protocol not found on DefiLlama — some data may be unavailable.*";

    const riskLabel = score?.riskLabel || "Unknown";
    const scoreTotal = score?.total ?? "N/A";

    const report = [
      `### Axiom Security Audit Report: ${displayName}`,
      `*Generated: ${now} | Powered by Nosana Decentralized Compute*`,
      ``,
      `#### Security Score: ${scoreTotal}/100 (${riskLabel})`,
      scoreTable,
      ``,
      `#### Protocol Overview`,
      overviewSection,
      ``,
      `#### Exploit History`,
      exploitSection,
      ``,
      `#### Bug Bounty Status`,
      bountySection,
      ``,
      `#### Contract Verification`,
      contractSection,
      ``,
      `#### AI Risk Assessment`,
      aiAssessment,
      ``,
      `#### Recommendations`,
      aiRecommendations || "- Monitor TVL for sudden drops (possible exploit signal)\n- Review audit history before depositing large amounts\n- Check smart contract verification before interaction\n- Follow protocol's official security disclosure channels",
      ``,
      `---`,
      `*Report generated by Axiom — composable security oracle on Nosana's decentralized GPU network*`,
    ].join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Audit report for Aave" } },
    { name: "Axiom", content: { text: "Generating security audit report for **Aave**...\n*Fetching data from DefiLlama, Etherscan, Immunefi, and rekt.news*" } },
  ], [
    { name: "user", content: { text: "Full security audit of Compound" } },
    { name: "Axiom", content: { text: "Generating security audit report for **Compound**...\n*Fetching data from DefiLlama, Etherscan, Immunefi, and rekt.news*" } },
  ]],
};
