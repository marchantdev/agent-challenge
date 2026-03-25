/**
 * INSPECT_CONTRACT
 * Fetches on-chain data for an Ethereum contract: balance, verification, proxy detection, deployer analysis.
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

const ETHERSCAN_API = "https://api.etherscan.io/api";
// Free Etherscan tier works without a key (rate-limited to 5 req/sec)
const API_KEY = process.env.ETHERSCAN_API_KEY || "";

export const inspectContractAction: Action = {
  name: "INSPECT_CONTRACT",
  description: "Inspects an Ethereum contract address: balance, transaction count, source verification, proxy detection.",
  similes: ["INSPECT", "CONTRACT_INFO", "ANALYZE_CONTRACT", "CHECK_CONTRACT", "SCAN_CONTRACT"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = (message.content?.text || "").toLowerCase();
    return text.includes("0x") || text.includes("inspect") || text.includes("contract") || text.includes("scan");
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";
    const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
    if (!addrMatch) {
      if (callback) await callback({
        text: "Please provide an Ethereum contract address (0x...). Example: 'Inspect 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'"
      });
      return;
    }

    const address = addrMatch[0];

    try {
      const [balRes, txRes, srcRes] = await Promise.all([
        fetch(`${ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${API_KEY}`),
        fetch(`${ETHERSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=5&sort=asc&apikey=${API_KEY}`),
        fetch(`${ETHERSCAN_API}?module=contract&action=getsourcecode&address=${address}&apikey=${API_KEY}`),
      ]);

      const balData = await balRes.json() as any;
      const txData = await txRes.json() as any;
      const srcData = await srcRes.json() as any;

      const weiBalance = balData.result || "0";
      const ethBalance = (parseInt(weiBalance) / 1e18).toFixed(4);
      const verified = srcData.result?.[0]?.SourceCode ? true : false;
      const contractName = srcData.result?.[0]?.ContractName || "Unknown";
      const compiler = srcData.result?.[0]?.CompilerVersion || "Unknown";
      const isProxy = srcData.result?.[0]?.Proxy === "1";
      const implementation = srcData.result?.[0]?.Implementation || "";

      // Deployer from first tx
      const firstTx = Array.isArray(txData.result) && txData.result.length > 0 ? txData.result[0] : null;
      const deployer = firstTx?.from || "Unknown";
      const deployDate = firstTx ? new Date(parseInt(firstTx.timeStamp) * 1000).toISOString().split("T")[0] : "Unknown";

      // Risk flags
      const flags: string[] = [];
      if (!verified) flags.push("**CRITICAL:** Source code NOT verified on Etherscan");
      if (isProxy) flags.push("**WARNING:** Proxy contract — admin can upgrade implementation");
      if (verified && !isProxy) flags.push("**OK:** Verified, non-upgradeable contract");

      // AI-powered contract analysis via Nosana-hosted Qwen model
      const contractContext = `Contract: ${contractName} | Address: ${address} | Balance: ${ethBalance} ETH | Verified: ${verified} | Proxy: ${isProxy}${isProxy && implementation ? ` | Implementation: ${implementation}` : ""} | Compiler: ${compiler} | Deployer: ${deployer} | Deployed: ${deployDate}`;

      let aiAnalysis = "";
      try {
        aiAnalysis = await generateText({
          runtime,
          context: `You are Axiom, a smart contract security analyst. Analyse this Ethereum contract data and provide a 3-4 sentence expert assessment. Explain likely what this contract does based on its name, note any security concerns from the flags (unverified, proxy upgradeable, etc.), and recommend next steps for a security researcher.\n\nContract data: ${contractContext}\nRisk flags: ${flags.join("; ")}`,
          modelClass: ModelClass.LARGE,
        });
      } catch { /* LLM unavailable — fallback to structured report */ }

      const report = [
        `## Contract Inspection: ${contractName}`,
        ``,
        `| Property | Value |`,
        `|----------|-------|`,
        `| Address | \`${address}\` |`,
        `| Name | ${contractName} |`,
        `| Balance | ${ethBalance} ETH |`,
        `| Verified | ${verified ? "Yes" : "No"} |`,
        `| Proxy | ${isProxy ? "Yes" : "No"} |`,
        isProxy && implementation ? `| Implementation | \`${implementation}\` |` : "",
        `| Compiler | ${compiler} |`,
        `| Deployer | \`${deployer}\` |`,
        `| Deploy Date | ${deployDate} |`,
        ``,
        `### Risk Flags`,
        flags.map((f, i) => `${i + 1}. ${f}`).join("\n"),
        aiAnalysis ? `\n### AI Analysis (Qwen via Nosana)\n${aiAnalysis}` : "",
        ``,
        `> Use ASSESS_PROTOCOL_RISK to evaluate the protocol this contract belongs to.`,
      ].filter(Boolean).join("\n");

      if (callback) await callback({ text: report });
    } catch (err) {
      if (callback) await callback({
        text: `Error inspecting contract: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  },
  examples: [[
    { name: "user", content: { text: "Inspect 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" } },
    { name: "Axiom", content: { text: "Scanning Ethereum contract..." } },
  ]],
};
