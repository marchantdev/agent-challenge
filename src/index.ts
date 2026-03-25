/**
 * Axiom Agent — Project Entry Point
 *
 * ElizaOS v2 project with Axiom character and custom DeFi security plugin.
 * Starts the frontend server alongside the agent.
 */

import { logger, type IAgentRuntime, type Project, type ProjectAgent } from "@elizaos/core";
import { character } from "./character.ts";
import axiomPlugin from "./plugin.ts";
import { startFrontendServer } from "./server.ts";

let frontendStarted = false;

const initAgent = async ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info(`Axiom agent initialized on Nosana decentralized compute`);
  logger.info(`Character: ${character.name} | Model: ${character.settings?.model || "default"}`);

  // Start frontend server once
  if (!frontendStarted) {
    frontendStarted = true;
    try {
      startFrontendServer();
      logger.info("Axiom frontend server started");
    } catch (err) {
      logger.error("Failed to start frontend server:", err);
    }
  }
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
