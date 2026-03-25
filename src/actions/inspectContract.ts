/**
 * INSPECT_CONTRACT
 * Fetches on-chain data for a contract/program address.
 * Supports both Ethereum (Etherscan) and Solana (Solscan) addresses.
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

const ETHERSCAN_API = "https://api.etherscan.io/api";
// Free Etherscan tier works without a key (rate-limited to 5 req/sec)
const ETH_API_KEY = process.env.ETHERSCAN_API_KEY || "";

import { solanaRpc, deriveAccountType } from "../utils/solanaRpc.js";

// ─── Address detection ────────────────────────────────────────────────────────

function isEthAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function isSolanaAddress(s: string): boolean {
  // base58, 32–44 chars, no 0x prefix
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

function extractEthAddress(text: string): string | null {
  const m = text.match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

function extractSolanaAddress(text: string): string | null {
  // Match standalone base58 token of 32-44 chars
  const m = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (m && isSolanaAddress(m[1])) return m[1];
  return null;
}

// ─── Solana RPC helpers ───────────────────────────────────────────────────────

async function fetchSolanaAccountInfo(address: string): Promise<any> {
  const result = await solanaRpc("getAccountInfo", [
    address,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]) as any;
  return result?.value ?? null;
}

async function fetchSolanaTransactions(address: string): Promise<any[]> {
  try {
    const result = await solanaRpc("getSignaturesForAddress", [
      address,
      { limit: 10 },
    ]) as any[];
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

// ─── Ethereum inspector ───────────────────────────────────────────────────────

async function handleEthContract(
  runtime: IAgentRuntime,
  address: string,
  callback?: HandlerCallback
): Promise<void> {
  const [balRes, txRes, srcRes] = await Promise.all([
    fetch(`${ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${ETH_API_KEY}`),
    fetch(`${ETHERSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=5&sort=asc&apikey=${ETH_API_KEY}`),
    fetch(`${ETHERSCAN_API}?module=contract&action=getsourcecode&address=${address}&apikey=${ETH_API_KEY}`),
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

  const firstTx = Array.isArray(txData.result) && txData.result.length > 0 ? txData.result[0] : null;
  const deployer = firstTx?.from || "Unknown";
  const deployDate = firstTx ? new Date(parseInt(firstTx.timeStamp) * 1000).toISOString().split("T")[0] : "Unknown";

  const flags: string[] = [];
  if (!verified) flags.push("**CRITICAL:** Source code NOT verified on Etherscan");
  if (isProxy) flags.push("**WARNING:** Proxy contract — admin can upgrade implementation");
  if (verified && !isProxy) flags.push("**OK:** Verified, non-upgradeable contract");

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
    `| Chain | Ethereum |`,
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
}

// ─── Solana inspector ─────────────────────────────────────────────────────────

async function handleSolanaProgram(
  runtime: IAgentRuntime,
  address: string,
  callback?: HandlerCallback
): Promise<void> {
  const [accountInfo, recentTxs] = await Promise.allSettled([
    fetchSolanaAccountInfo(address),
    fetchSolanaTransactions(address),
  ]);

  const info = accountInfo.status === "fulfilled" ? accountInfo.value : null;
  const txs = recentTxs.status === "fulfilled" ? recentTxs.value : [];

  // Parse account data — RPC getAccountInfo returns flat { lamports, owner, executable, rentEpoch, data }
  const lamports: number = info?.lamports ?? 0;
  const solBalance = (lamports / 1e9).toFixed(6);
  const owner: string = info?.owner ?? "Unknown";
  const executable: boolean = info?.executable ?? false;
  const rentEpoch: number | null = info?.rentEpoch ?? null;
  const accountType: string = deriveAccountType(owner, executable);
  const isProgram = executable;
  const isSystemProgram = owner === "11111111111111111111111111111111";

  // Build flags
  const flags: string[] = [];
  if (executable) {
    flags.push("**INFO:** Executable program on-chain");
  }
  if (isSystemProgram) {
    flags.push("**INFO:** System-owned account (SOL wallet)");
  }
  if (!executable && !isSystemProgram) {
    flags.push("**INFO:** Data account — not an executable program");
  }

  // Recent tx summary
  const txCount = txs.length;
  // getSignaturesForAddress returns { signature, blockTime, err, ... }
  const firstTxSig = txs[txs.length - 1]?.signature ?? null;
  const lastTxSig = txs[0]?.signature ?? null;
  const lastTxTime = txs[0]?.blockTime
    ? new Date((txs[0].blockTime as number) * 1000).toISOString().split("T")[0]
    : "Unknown";

  const contractContext = `Solana Address: ${address} | Balance: ${solBalance} SOL | Type: ${accountType} | Executable: ${executable} | Owner Program: ${owner} | Recent tx count (last 10): ${txCount} | Last activity: ${lastTxTime}`;

  let aiAnalysis = "";
  try {
    aiAnalysis = await generateText({
      runtime,
      context: `You are Axiom, a Solana security analyst. Analyze this Solana account data and provide a 3-4 sentence expert assessment. Based on the account type, owner program, and executable flag, describe what this account likely is (wallet, program, token account, PDA, etc.), note any security observations, and recommend next steps for a security researcher.\n\nAccount data: ${contractContext}\nFlags: ${flags.join("; ")}`,
      modelClass: ModelClass.LARGE,
    });
  } catch { /* LLM unavailable */ }

  const report = [
    `## Solana Account Inspection`,
    ``,
    `| Property | Value |`,
    `|----------|-------|`,
    `| Chain | Solana |`,
    `| Address | \`${address}\` |`,
    `| Type | ${accountType} |`,
    `| Executable | ${executable ? "Yes (on-chain program)" : "No"} |`,
    `| SOL Balance | ${solBalance} SOL |`,
    `| Owner Program | \`${owner}\` |`,
    rentEpoch !== null ? `| Rent Epoch | ${rentEpoch} |` : "",
    `| Recent Txs | ${txCount} (last 10 fetched) |`,
    lastTxSig ? `| Latest Tx | \`${String(lastTxSig).slice(0, 20)}...\` |` : "",
    `| Last Activity | ${lastTxTime} |`,
    ``,
    `### Flags`,
    flags.map((f, i) => `${i + 1}. ${f}`).join("\n"),
    aiAnalysis ? `\n### AI Analysis (Qwen via Nosana)\n${aiAnalysis}` : "",
    ``,
    `> [View on Solscan](https://solscan.io/account/${address}) | Use ANALYZE_WALLET to check token holdings.`,
  ].filter(Boolean).join("\n");

  if (callback) await callback({ text: report });
}

// ─── Action definition ────────────────────────────────────────────────────────

export const inspectContractAction: Action = {
  name: "INSPECT_CONTRACT",
  description: "Inspects an on-chain contract or program address (Ethereum or Solana): balance, verification, proxy detection, deploy info.",
  similes: ["INSPECT", "CONTRACT_INFO", "ANALYZE_CONTRACT", "CHECK_CONTRACT", "SCAN_CONTRACT"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "");
    const lower = text.toLowerCase();
    // Accept if an ETH address present, or a likely Solana address, or inspection keywords
    const hasEth = /0x[a-fA-F0-9]{40}/.test(text);
    const hasSolana = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);
    return hasEth || hasSolana || lower.includes("inspect") || lower.includes("contract") || lower.includes("scan");
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = message.content?.text || "";

    // Prefer ETH address (explicit 0x prefix), fallback to Solana base58
    const ethAddr = extractEthAddress(text);
    const solAddr = !ethAddr ? extractSolanaAddress(text) : null;

    if (!ethAddr && !solAddr) {
      if (callback) await callback({
        text: "Please provide a contract address.\n\n- **Ethereum:** `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`\n- **Solana:** `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`"
      });
      return;
    }

    try {
      if (ethAddr) {
        await handleEthContract(runtime, ethAddr, callback);
      } else if (solAddr) {
        await handleSolanaProgram(runtime, solAddr, callback);
      }
    } catch (err) {
      if (callback) await callback({
        text: `Error inspecting address: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  },
  examples: [
    [{
      name: "user", content: { text: "Inspect 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" }
    }, {
      name: "Axiom", content: { text: "## Contract Inspection: UniswapV2Router02\n\n| Property | Value |\n..." }
    }],
    [{
      name: "user", content: { text: "Inspect TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }
    }, {
      name: "Axiom", content: { text: "## Solana Account Inspection\n\n| Property | Value |\n| Chain | Solana |\n..." }
    }],
  ],
};
