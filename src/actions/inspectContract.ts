/**
 * INSPECT_CONTRACT
 *
 * AI-powered on-chain contract and program inspector.
 * Supports both Ethereum (0x…) and Solana (base58) addresses — auto-detected.
 *
 * Ethereum flow:
 *   1. Fetches ETH balance, bytecode presence, ERC-20 name/symbol, and Sourcify
 *      verification status in parallel via {@link getEthBalance}, {@link isEthContract},
 *      {@link getErc20Name}, {@link getErc20Symbol}, {@link checkSourcifyVerification}.
 *   2. Builds a structured flag list (unverified source, ERC-20 type, EOA detection).
 *   3. Calls {@link generateText} (Qwen3.5-27B via Nosana) for a 3–4 sentence expert
 *      assessment of the address type and security implications.
 *
 * Solana flow:
 *   1. Fetches account info (lamports, owner program, executable flag) and recent
 *      transaction signatures via Solana JSON-RPC.
 *   2. Derives account type (wallet, executable program, token account, PDA) using
 *      {@link deriveAccountType}.
 *   3. Calls {@link generateText} (Qwen3.5-27B via Nosana) for a 3–4 sentence
 *      Solana-specific assessment.
 *
 * Data sources: Sourcify API (ETH verification), Ethplorer/ethRpc utils (ETH balance),
 * Solana JSON-RPC (account data), Nosana-hosted Qwen LLM (AI commentary).
 *
 * @module inspectContract
 */

import { generateText, ModelClass } from "@elizaos/core";
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

import { getEthBalance, isEthContract, getErc20Name, getErc20Symbol, checkSourcifyVerification } from "../utils/ethRpc.js";
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
  // Fetch balance, code presence, ERC-20 metadata, and Sourcify verification in parallel
  const [ethBalance, contractCode, erc20Name, erc20Symbol, verificationStatus] = await Promise.allSettled([
    getEthBalance(address),
    isEthContract(address),
    getErc20Name(address),
    getErc20Symbol(address),
    checkSourcifyVerification(address),
  ]);

  const balance = ethBalance.status === "fulfilled" ? ethBalance.value : 0;
  const isContract = contractCode.status === "fulfilled" ? contractCode.value : false;
  const tokenName = erc20Name.status === "fulfilled" ? erc20Name.value : null;
  const tokenSymbol = erc20Symbol.status === "fulfilled" ? erc20Symbol.value : null;
  const verif = verificationStatus.status === "fulfilled" ? verificationStatus.value : "unverified";

  const contractName = tokenName || (isContract ? "Unknown Contract" : "EOA (Wallet)");
  const verified = verif !== "unverified";
  const ethBalance_str = balance.toFixed(4);

  const flags: string[] = [];
  if (!isContract) {
    flags.push("**INFO:** This is an externally owned account (EOA), not a smart contract");
  } else {
    if (!verified) flags.push("**WARNING:** Source code NOT verified on Sourcify");
    if (verif === "partial") flags.push("**INFO:** Partially verified on Sourcify (metadata may differ)");
    if (verified && verif === "verified") flags.push("**OK:** Fully verified on Sourcify");
    if (tokenName && tokenSymbol) flags.push(`**INFO:** ERC-20 token — ${tokenName} (${tokenSymbol})`);
  }

  const contractContext = `Contract: ${contractName} | Address: ${address} | Balance: ${ethBalance_str} ETH | Is Contract: ${isContract} | Verified: ${verified} | ERC-20: ${tokenName ? `${tokenName} (${tokenSymbol})` : "No"}`;

  let aiAnalysis = "";
  try {
    aiAnalysis = await generateText({
      runtime,
      context: `You are Axiom, a smart contract security analyst. Analyse this Ethereum address data and provide a 3-4 sentence expert assessment. Explain what this address likely is, note any security concerns, and recommend next steps for a security researcher.\n\nData: ${contractContext}\nFlags: ${flags.join("; ")}`,
      modelClass: ModelClass.LARGE,
    });
  } catch { /* LLM unavailable — structured report fallback */ }

  const report = [
    `## Contract Inspection: ${contractName}`,
    ``,
    `| Property | Value |`,
    `|----------|-------|`,
    `| Chain | Ethereum |`,
    `| Address | \`${address}\` |`,
    `| Type | ${isContract ? "Smart Contract" : "EOA (Wallet)"} |`,
    tokenSymbol ? `| Token | ${tokenName} (${tokenSymbol}) |` : "",
    `| ETH Balance | ${ethBalance_str} ETH |`,
    `| Verified | ${verif === "verified" ? "Yes (Sourcify)" : verif === "partial" ? "Partial (Sourcify)" : "No"} |`,
    ``,
    `### Risk Flags`,
    flags.map((f, i) => `${i + 1}. ${f}`).join("\n"),
    aiAnalysis ? `\n### AI Analysis (Qwen via Nosana)\n${aiAnalysis}` : "",
    ``,
    `> [View on Etherscan](https://etherscan.io/address/${address}) | Use ANALYZE_WALLET for token holdings.`,
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
