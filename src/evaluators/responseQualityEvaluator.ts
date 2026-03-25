/**
 * Response Quality Evaluator
 *
 * After every agent response, evaluates whether it met quality criteria:
 *   - Security Score present (for risk assessment responses)
 *   - Actionable recommendations (not just raw data)
 *   - Source attribution (which APIs / data sources were cited)
 *
 * Returns a quality signal that is logged for monitoring.
 * This demonstrates use of the full ElizaOS framework:
 * actions + providers + evaluators.
 */

import type { Evaluator, IAgentRuntime, Memory, State } from "@elizaos/core";

interface QualitySignal {
  messageId: string;
  hasSecurityScore: boolean;
  hasRecommendations: boolean;
  hasSourceAttribution: boolean;
  score: number; // 0-3
  timestamp: number;
}

// In-memory quality log (last 100 responses)
const qualityLog: QualitySignal[] = [];

export function getQualityLog(): QualitySignal[] {
  return [...qualityLog];
}

export const responseQualityEvaluator: Evaluator = {
  name: "RESPONSE_QUALITY",
  description:
    "Evaluates agent responses for security score inclusion, actionable recommendations, and source attribution. Logs a quality signal after every response.",
  similes: ["QUALITY_CHECK", "RESPONSE_EVAL", "OUTPUT_QUALITY"],
  alwaysRun: true,

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Run on all non-empty responses
    const text = (message.content?.text || "").trim();
    return text.length > 0;
  },

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<void> => {
    const text = message.content?.text || "";

    // Check 1: Security Score present (emoji indicator or explicit score)
    const hasSecurityScore =
      /security score|score:\s*\d+\/100|\d+\/100|🟢|🟡|🟠|🔴/i.test(text);

    // Check 2: Actionable language (recommendations, not just data)
    const hasRecommendations =
      /recommend|suggest|should|consider|action|mitigate|avoid|monitor|watch|be cautious|use caution|check/i.test(
        text
      );

    // Check 3: Source attribution (data source named)
    const hasSourceAttribution =
      /defillama|etherscan|solana rpc|coingecko|github|immunefi|nosana|api\.llama\.fi|ethplorer/i.test(
        text
      );

    const score =
      (hasSecurityScore ? 1 : 0) +
      (hasRecommendations ? 1 : 0) +
      (hasSourceAttribution ? 1 : 0);

    const signal: QualitySignal = {
      messageId: message.id || "unknown",
      hasSecurityScore,
      hasRecommendations,
      hasSourceAttribution,
      score,
      timestamp: Date.now(),
    };

    qualityLog.push(signal);
    if (qualityLog.length > 100) qualityLog.shift();

    if (score < 2) {
      // Low-quality response — logged for future improvement
      console.debug(
        `[ResponseQuality] Low quality signal: score=${score}/3`,
        {
          hasSecurityScore,
          hasRecommendations,
          hasSourceAttribution,
        }
      );
    }
  },

  examples: [],
};
