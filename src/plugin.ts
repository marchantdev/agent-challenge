/**
 * axiom-security-plugin
 * DeFi security intelligence actions for the Axiom agent.
 *
 * 12 actions: protocol risk assessment, vulnerability explanation, TVL scanning,
 * contract inspection, exploit history, wallet analysis, bounty scanning,
 * repo recon, Nosana status, protocol watchlist monitoring, protocol comparison,
 * full audit report generation.
 *
 * Also overrides TEXT_SMALL/TEXT_LARGE model handlers (priority=10) to use
 * the OpenAI Chat Completions API (/v1/chat/completions) instead of the Responses
 * API (/v1/responses).  Nosana-hosted Qwen only serves /v1/chat/completions.
 */

import { type Plugin, type GenerateTextParams, ModelType, logger } from "@elizaos/core";
import { assessRiskAction } from "./actions/assessRisk.ts";
import { explainVulnAction } from "./actions/explainVuln.ts";
import { scanTvlAction } from "./actions/scanTvl.ts";
import { inspectContractAction } from "./actions/inspectContract.ts";
import { exploitHistoryAction } from "./actions/exploitHistory.ts";
import { analyzeWalletAction } from "./actions/analyzeWallet.ts";
import { scanBountiesAction } from "./actions/scanBounties.ts";
import { auditReconAction } from "./actions/auditRecon.ts";
import { nosanaStatusAction } from "./actions/nosanaStatus.ts";
import { monitorProtocolAction } from "./actions/monitorProtocol.ts";
import { compareProtocolsAction } from "./actions/compareProtocols.ts";
import { generateAuditReportAction } from "./actions/generateAuditReport.ts";
import { defiMarketProvider } from "./providers/defiMarketProvider.ts";
import { responseQualityEvaluator } from "./evaluators/responseQualityEvaluator.ts";

/**
 * Resolve the Nosana inference base URL.
 *
 * Priority (first non-empty wins):
 *  1. NOSANA_INFERENCE_URL  — set explicitly in nos_job_def.json; never overridden by start.sh
 *  2. OPENAI_BASE_URL       — may be the original Nosana URL or the proxy URL (if start.sh ran)
 *  3. Fallback localhost     — for local dev / testing
 */
function getInferenceBaseUrl(): string {
  return (
    process.env.NOSANA_INFERENCE_URL ||
    process.env.OPENAI_BASE_URL ||
    "http://localhost:4001"
  ).replace(/\/$/, "");
}

/**
 * Call Nosana Qwen via Chat Completions API.
 * Always POSTs to {baseUrl}/v1/chat/completions — never /v1/responses.
 */
async function callNosanaChat(
  messages: Array<{ role: string; content: string }>,
  modelName: string,
  maxTokens: number,
): Promise<string> {
  const baseUrl = getInferenceBaseUrl();
  const url = `${baseUrl}/v1/chat/completions`;
  const apiKey = process.env.OPENAI_API_KEY || "nosana";

  logger.debug(`[Axiom:LLM] POST ${url} model=${modelName} msgs=${messages.length}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`[Axiom:LLM] ${res.status} from ${url}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  // Strip Qwen3 chain-of-thought <think>...</think> tokens so ElizaOS XML
  // parsing receives a clean <response>...</response> block.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  logger.debug(`[Axiom:LLM] reply length=${text.length} (raw=${raw.length})`);
  return text;
}

/** Build messages from prompt + optional system */
function msgs(
  prompt: string,
  system?: string,
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (system) out.push({ role: "system", content: system });
  out.push({ role: "user", content: prompt });
  return out;
}

const SMALL_MODEL = () => process.env.OPENAI_SMALL_MODEL || "Qwen3.5-27B-AWQ-4bit";
const LARGE_MODEL = () => process.env.OPENAI_LARGE_MODEL || "Qwen3.5-27B-AWQ-4bit";

export const axiomPlugin: Plugin = {
  name: "axiom-security-plugin",
  description:
    "DeFi Security Operations Center: protocol risk assessment, exploit tracking, contract inspection, TVL monitoring, wallet risk analysis, protocol watchlist monitoring, protocol comparison, full audit report generation, and Nosana infrastructure awareness.",

  // priority=10 ensures these handlers win over @elizaos/plugin-openai (priority=0)
  priority: 10,

  actions: [
    assessRiskAction,
    explainVulnAction,
    scanTvlAction,
    inspectContractAction,
    exploitHistoryAction,
    analyzeWalletAction,
    scanBountiesAction,
    auditReconAction,
    nosanaStatusAction,
    monitorProtocolAction,
    compareProtocolsAction,
    generateAuditReportAction,
  ],
  providers: [defiMarketProvider],
  evaluators: [responseQualityEvaluator],

  models: {
    // Override TEXT_SMALL: use /v1/chat/completions, not /v1/responses
    [ModelType.TEXT_SMALL]: async (runtime, params: GenerateTextParams) => {
      return callNosanaChat(
        msgs(params.prompt, runtime.character.system ?? undefined),
        SMALL_MODEL(),
        params.maxTokens ?? 4096,
      );
    },
    // Override TEXT_LARGE: use /v1/chat/completions, not /v1/responses
    [ModelType.TEXT_LARGE]: async (runtime, params: GenerateTextParams) => {
      return callNosanaChat(
        msgs(params.prompt, runtime.character.system ?? undefined),
        LARGE_MODEL(),
        params.maxTokens ?? 8192,
      );
    },
  },
};

export default axiomPlugin;
