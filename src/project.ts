/**
 * Axiom Agent Project Entry Point
 *
 * Loads the Axiom character and registers the axiom-security-plugin
 * for DeFi security intelligence.
 */

import { logger, type IAgentRuntime, type Project, type ProjectAgent } from "@elizaos/core";
import { character } from "./character.ts";
import axiomPlugin from "./plugin.ts";

const initAgent = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info("Axiom security agent initialized");
  logger.info({ name: character.name, model: character.settings?.model }, "Agent config:");
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initAgent({ runtime }),
  plugins: [axiomPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from "./character.ts";

export default project;
