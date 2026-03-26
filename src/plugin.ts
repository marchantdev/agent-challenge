/**
 * axiom-security-plugin
 * DeFi security intelligence actions for the Axiom agent.
 *
 * 12 actions: protocol risk assessment, vulnerability explanation, TVL scanning,
 * contract inspection, exploit history, wallet analysis, bounty scanning,
 * repo recon, Nosana status, protocol watchlist monitoring, protocol comparison,
 * full audit report generation.
 */

import { type Plugin } from "@elizaos/core";
import { startFrontendServer } from "./server.ts";
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

let frontendStarted = false;

export const axiomPlugin: Plugin = {
  name: "axiom-security-plugin",
  description: "DeFi Security Operations Center: protocol risk assessment, exploit tracking, contract inspection, TVL monitoring, wallet risk analysis, protocol watchlist monitoring, protocol comparison, full audit report generation, and Nosana infrastructure awareness.",
  init: async () => {
    if (!frontendStarted) {
      frontendStarted = true;
      startFrontendServer();
    }
  },
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
};

export default axiomPlugin;
