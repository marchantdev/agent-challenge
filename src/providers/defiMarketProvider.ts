/**
 * DeFi Market Context Provider
 * Fetches top TVL movers from DefiLlama and flags anomalies.
 * Injected into every agent response automatically.
 */

import type { Provider } from "@elizaos/core";
import { cachedFetch, formatUsd } from "../utils/api.ts";

const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
const DEFILLAMA_TVL_URL = "https://api.llama.fi/v2/historicalChainTvl";

interface LlamaProtocol {
  name: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
}

export const defiMarketProvider: Provider = {
  name: "defiMarketContext",
  description:
    "Live DeFi market context: top TVL movers and anomaly alerts from DefiLlama.",

  get: async (_runtime, _message, _state) => {
    try {
      const protocols: LlamaProtocol[] = await cachedFetch(
        DEFILLAMA_PROTOCOLS_URL,
        600_000, // 10 min cache — avoid hammering API
      );

      // Filter to protocols with valid TVL and 24h change data
      const withChange = protocols.filter(
        (p) =>
          p.tvl > 0 &&
          p.change_1d !== null &&
          p.change_1d !== undefined &&
          isFinite(p.change_1d),
      );

      // Sort by absolute 24h change to find biggest movers
      const sorted = [...withChange].sort(
        (a, b) => Math.abs(b.change_1d!) - Math.abs(a.change_1d!),
      );
      const topMovers = sorted.slice(0, 5);

      // Flag protocols with >10% TVL drop (24h or 7d) as anomalies
      const anomalies = withChange.filter(
        (p) =>
          (p.change_1d !== null && p.change_1d < -10) ||
          (p.change_7d !== null && p.change_7d < -10),
      );

      // Calculate total DeFi TVL
      let totalTvl = 0;
      try {
        const tvlHistory: { tvl: number }[] = await cachedFetch(
          DEFILLAMA_TVL_URL,
          600_000,
        );
        if (tvlHistory.length > 0) {
          totalTvl = tvlHistory[tvlHistory.length - 1].tvl;
        }
      } catch {
        // Fallback: sum top protocols
        totalTvl = protocols
          .filter((p) => p.tvl > 0)
          .reduce((sum, p) => sum + p.tvl, 0);
      }

      // Format movers
      const moversStr = topMovers
        .map((p) => {
          const sign = p.change_1d! >= 0 ? "+" : "";
          return `${p.name} ${sign}${p.change_1d!.toFixed(1)}%`;
        })
        .join(", ");

      // Format anomalies
      let anomalyStr = "";
      if (anomalies.length > 0) {
        const top3 = anomalies.slice(0, 3);
        anomalyStr =
          " Anomalies: " +
          top3
            .map((p) => {
              if (p.change_7d !== null && p.change_7d < -10) {
                return `${p.name} ${p.change_7d.toFixed(1)}% (7d)`;
              }
              return `${p.name} ${p.change_1d!.toFixed(1)}% (24h)`;
            })
            .join(", ") +
          ".";
      }

      const text = `Current DeFi Market: Top movers (24h): ${moversStr}.${anomalyStr} Total DeFi TVL: ${formatUsd(totalTvl)}.`;

      return {
        text,
        data: {
          topMovers: topMovers.map((p) => ({
            name: p.name,
            change1d: p.change_1d,
            tvl: p.tvl,
          })),
          anomalies: anomalies.slice(0, 5).map((p) => ({
            name: p.name,
            change1d: p.change_1d,
            change7d: p.change_7d,
            tvl: p.tvl,
          })),
          totalTvl,
        },
      };
    } catch (err) {
      return {
        text: "DeFi market data temporarily unavailable.",
        data: { error: String(err) },
      };
    }
  },
};
