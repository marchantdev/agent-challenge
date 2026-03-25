/**
 * axiom-security-plugin
 * DeFi security intelligence actions for the Axiom agent.
 *
 * 10 actions: protocol risk assessment, vulnerability explanation, TVL scanning,
 * contract inspection, exploit history, wallet analysis, bounty scanning,
 * repo recon, Nosana status, protocol watchlist monitoring.
 */

import { type Plugin } from "@elizaos/core";
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
import { defiMarketProvider } from "./providers/defiMarketProvider.ts";
import { responseQualityEvaluator } from "./evaluators/responseQualityEvaluator.ts";

export const axiomPlugin: Plugin = {
  name: "axiom-security-plugin",
  description: "DeFi Security Operations Center: protocol risk assessment, exploit tracking, contract inspection, TVL monitoring, wallet risk analysis, protocol watchlist monitoring, and Nosana infrastructure awareness.",
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
  ],
  providers: [defiMarketProvider],
  evaluators: [responseQualityEvaluator],
};

export default axiomPlugin;
