/**
 * axiom-security-plugin
 * DeFi security intelligence actions for the Axiom agent.
 *
 * 8 actions: protocol risk assessment, vulnerability explanation, TVL scanning,
 * contract inspection, exploit history, bounty scanning, repo recon, Nosana status.
 */

import { type Plugin } from "@elizaos/core";
import { assessRiskAction } from "./actions/assessRisk.ts";
import { explainVulnAction } from "./actions/explainVuln.ts";
import { scanTvlAction } from "./actions/scanTvl.ts";
import { inspectContractAction } from "./actions/inspectContract.ts";
import { exploitHistoryAction } from "./actions/exploitHistory.ts";
import { scanBountiesAction } from "./actions/scanBounties.ts";
import { auditReconAction } from "./actions/auditRecon.ts";
import { nosanaStatusAction } from "./actions/nosanaStatus.ts";

export const axiomPlugin: Plugin = {
  name: "axiom-security-plugin",
  description: "DeFi Security Operations Center: protocol risk assessment, exploit tracking, contract inspection, TVL monitoring, and Nosana infrastructure awareness.",
  actions: [
    assessRiskAction,
    explainVulnAction,
    scanTvlAction,
    inspectContractAction,
    exploitHistoryAction,
    scanBountiesAction,
    auditReconAction,
    nosanaStatusAction,
  ],
  providers: [],
  evaluators: [],
};

export default axiomPlugin;
