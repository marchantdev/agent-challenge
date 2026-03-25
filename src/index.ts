/**
 * Axiom — DeFi Intelligence Agent
 * Custom Plugin for ElizaOS
 *
 * Provides smart contract security analysis and DeFi research actions.
 */

import { type Plugin, type IAgentRuntime, type Memory, type State, type HandlerCallback } from "@elizaos/core";

/**
 * Protocol Risk Assessment Action
 * Triggers when user asks to assess/audit/review a protocol or contract
 */
const protocolRiskAction = {
  name: "ASSESS_PROTOCOL_RISK",
  description: "Perform a structured risk assessment framework analysis for a DeFi protocol",
  similes: ["AUDIT_PROTOCOL", "RISK_ASSESSMENT", "SECURITY_REVIEW", "ANALYSE_PROTOCOL", "CHECK_PROTOCOL"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";
    return (
      text.includes("audit") ||
      text.includes("risk") ||
      text.includes("assess") ||
      text.includes("review") ||
      text.includes("check") ||
      text.includes("analyse") ||
      text.includes("analyze")
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const text = (message.content as { text?: string }).text ?? "";

    const protocolMatch = text.match(/(?:audit|assess|review|check|analyse|analyze)\s+([A-Za-z0-9\s]+?)(?:\s+protocol|\s+contract|\s+vault|\s*$)/i);
    const protocolName = protocolMatch?.[1]?.trim() ?? "the protocol";

    await callback({
      text: `**Axiom Risk Assessment Framework: ${protocolName}**\n\nI apply a 5-layer analysis. For specific findings I need the contract addresses or source — here's the framework:\n\n**1. Trust Model Analysis**\n- Who are the privileged actors? (Owner, admin, timelock, multisig, DAO)\n- What can they do unilaterally? (Pause, upgrade, change parameters, drain funds)\n- Is there a timelock? What's the delay — hours or days?\n- Can a single private key drain the protocol?\n\n**2. Invariant Identification**\n- What must always be true? (Total debt ≤ total collateral, share price monotonically increasing, etc.)\n- Which functions can break these invariants?\n- Are invariants asserted or merely assumed?\n\n**3. Economic Attack Surface**\n- Can price oracles be manipulated? (TWAP vs spot price, flash loan vectors)\n- Are there donation attacks? (Direct token transfers inflating exchange rates — ERC-4626 first depositor)\n- Can the protocol be arbitraged against stale prices?\n- What happens if the peg breaks? What cascades?\n\n**4. Composability Risks**\n- What external contracts does this protocol call?\n- Can any dependency be paused, bricked, or drained?\n- Are there reentrancy vectors? (state updates AFTER external calls)\n- Does the protocol correctly handle ERC-20 tokens that return false instead of reverting?\n\n**5. Upgrade & Governance Risk**\n- Is the contract upgradeable? Which proxy pattern (Transparent, UUPS, Beacon)?\n- Who controls upgrades — EOA, multisig, or timelock DAO?\n- Can storage slots be corrupted by an upgrade? (check for storage gaps in inherited contracts)\n- What's the governance attack surface? (Flash-borrowable governance tokens?)\n\nShare the contract address or GitHub repo and I'll give you specific findings rather than a generic framework.`,
      action: "ASSESS_PROTOCOL_RISK",
    });
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Can you assess the risk of this Aave fork?" },
      },
      {
        name: "Axiom",
        content: {
          text: "**Axiom Risk Assessment Framework: Aave fork**\n\nI apply a 5-layer analysis...",
          action: "ASSESS_PROTOCOL_RISK",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Audit this yield vault for me" },
      },
      {
        name: "Axiom",
        content: {
          text: "**Axiom Risk Assessment Framework: yield vault**\n\nI'll walk through the systematic analysis...",
          action: "ASSESS_PROTOCOL_RISK",
        },
      },
    ],
  ],
};

/**
 * Vulnerability Pattern Explainer
 * Gives structured, deep explanations of smart contract vulnerability classes
 */
const vulnExplainerAction = {
  name: "EXPLAIN_VULNERABILITY",
  description: "Explain a smart contract vulnerability pattern with examples and mitigations",
  similes: ["VULN_EXPLAIN", "SECURITY_CONCEPT", "EXPLAIN_ATTACK", "HOW_DOES_ATTACK_WORK", "EXPLAIN_EXPLOIT"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";
    const vulnKeywords = [
      "reentrancy", "flash loan", "price manipulation", "oracle", "overflow",
      "underflow", "access control", "front.?run", "sandwich", "mev",
      "storage collision", "proxy", "delegatecall", "selfdestruct",
      "integer", "rounding", "inflation attack", "donation attack",
      "exploit", "vulnerability", "attack", "hack", "bug"
    ];
    return vulnKeywords.some(kw => new RegExp(kw).test(text));
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";

    let explanation = "";

    if (text.includes("reentrancy")) {
      explanation = `**Reentrancy** — Classic DeFi attack vector. $60M lost in the DAO hack alone.\n\n**The Pattern:**\nA contract calls an external address before updating its own state. The external address calls back into the original contract before the first execution completes, seeing stale (pre-update) state.\n\n**Classic Example (The DAO, 2016):**\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);\n    (bool success,) = msg.sender.call{value: amount}(""); // External call first!\n    balances[msg.sender] -= amount;  // State update AFTER — already too late\n}\n\`\`\`\nAttacker deploys a contract whose \`receive()\` calls \`withdraw()\` again before balance is decremented. Loops until the victim is drained.\n\n**Modern Variants:**\n- **Cross-function reentrancy**: Enter a different function (not the same one) that reads stale state\n- **Cross-contract reentrancy**: Two contracts share state; reentrancy path goes through the shared state\n- **Read-only reentrancy**: ERC-4626 vault price can be manipulated mid-execution via view functions called during an ongoing transaction (Curve exploit 2023)\n\n**The Fix — Checks-Effects-Interactions:**\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);  // Check\n    balances[msg.sender] -= amount;            // Effect FIRST\n    (bool success,) = msg.sender.call{value: amount}(""); // Then interact\n    require(success, "Transfer failed");\n}\n\`\`\`\nOr use OpenZeppelin's \`ReentrancyGuard\` with \`nonReentrant\` modifier as belt-and-suspenders.`;

    } else if (text.includes("flash loan")) {
      explanation = `**Flash Loan Attacks** — Uncollateralised capital weaponised against oracle-dependent protocols.\n\n**What makes them dangerous:**\nFlash loans give attackers effectively unlimited capital within a single transaction. This isn't a bug in flash loans — it's that protocols assume market manipulation requires sustained capital the attacker doesn't have.\n\n**Anatomy of a Flash Loan Attack:**\n1. Borrow $100M USDC from Aave (0 collateral, must repay in same tx)\n2. Swap $100M USDC → ETH in the target AMM (spot price now massively inflated)\n3. Borrow against inflated ETH price on the victim lending protocol\n4. Leave with borrowed funds, default on collateral\n5. Repay $100M flash loan + fee\n6. Net: extracted protocol funds at zero upfront cost\n\n**Real Examples:**\n- **Mango Markets** ($117M, Solana, Oct 2022): Flash-borrowed MNGO tokens, pumped own oracle price, borrowed against inflated collateral\n- **Beanstalk** ($180M, Apr 2022): Flash-borrowed enough tokens to achieve 2/3 supermajority in governance, passed malicious proposal in same block\n- **Harvest Finance** ($34M, Oct 2020): AMM spot price manipulation during flash loan to exploit stale USDC/USDT rate\n\n**The Fixes:**\n- Use **TWAPs** (time-weighted average prices) over 30+ minutes — single-block manipulation becomes economically infeasible\n- For governance: require a **timelock** between proposal and execution — flash-borrowed votes can't hold tokens for the delay period\n- Never use AMM spot prices as oracle inputs for anything that affects protocol solvency`;

    } else if (text.includes("oracle") || text.includes("price manipulation")) {
      explanation = `**Oracle Manipulation & Price Feed Attacks** — The single largest source of DeFi losses.\n\n**Why Oracles Are Critical:**\nOracles are the bridge between off-chain prices and on-chain protocol state. If an attacker can move the price an oracle reports, they can break any protocol that uses that price for collateral valuation, liquidation thresholds, or peg mechanics.\n\n**Types of Oracle Attacks:**\n\n**1. AMM Spot Price Manipulation**\nUsing an AMM pool as a price oracle is catastrophically dangerous:\n\`\`\`solidity\n// NEVER DO THIS\nfunction getPrice() view returns (uint) {\n    (uint r0, uint r1,) = IUniswapV2Pair(pair).getReserves();\n    return r1 * 1e18 / r0;  // Spot price — manipulable in one tx!\n}\n\`\`\`\nFix: Use Uniswap V3 TWAP with a minimum 30-minute window.\n\n**2. Chainlink Heartbeat Staleness**\nChainlink has a heartbeat (1h or 24h) and deviation threshold (0.5%). A price can be stale by hours without triggering an update. If a lending protocol doesn't check the \`updatedAt\` timestamp:\n\`\`\`solidity\n// Missing staleness check — dangerous\n(, int price,,,) = priceFeed.latestRoundData();\n// Should be:\n(, int price,, uint updatedAt,) = priceFeed.latestRoundData();\nrequire(block.timestamp - updatedAt < 3600, "Stale price");\n\`\`\`\n\n**3. Price Feed Sequencer Downtime (L2s)**\nOn Arbitrum/Optimism, the sequencer can go offline. Chainlink has a sequencer uptime feed — protocols must check it before trusting any price. Synthetix has been exploited via this vector.\n\n**4. Composite Oracle Attacks**\nWhen protocol value depends on price_A AND price_B (e.g. a stablecoin LP), manipulating either component is sufficient. LP token pricing requires querying both reserve tokens' prices separately.`;

    } else if (text.includes("access control")) {
      explanation = `**Access Control Failures** — The most common class of critical/high severity findings.\n\n**Common Patterns:**\n\n**1. Missing modifier entirely:**\n\`\`\`solidity\n// VULNERABLE — anyone can call this\nfunction setFeeRecipient(address newRecipient) external {\n    feeRecipient = newRecipient;\n}\n// FIXED\nfunction setFeeRecipient(address newRecipient) external onlyOwner {\n    feeRecipient = newRecipient;\n}\n\`\`\`\n\n**2. Incorrect role check** — Checks wrong role, granting too broad access.\n\n**3. Initialiser not protected:**\n\`\`\`solidity\n// VULNERABLE — anyone can reinitialise a proxy\nfunction initialize(address admin) external {\n    owner = admin;  // Missing initializer guard!\n}\n// Fix: use OpenZeppelin Initializable with initializer modifier\n\`\`\`\n\n**4. Permissionless state changes affecting protocol invariants:**\nA public function that changes fee calculations, collateral ratios, or reward distribution with no access control can be called by any user to grief or redirect value — a real bounty-finding class.\n\n**What to look for:**\n- Every \`external\`/\`public\` state-changing function: does it need a modifier?\n- Every \`initialize()\`: protected from re-initialisation?\n- Admin roles: are they granular? (UPGRADER ≠ PAUSER)\n- Two-step ownership transfer for high-impact parameter changes`;

    } else if (text.includes("overflow") || text.includes("underflow") || text.includes("integer")) {
      explanation = `**Integer Overflow & Underflow** — Pre-Solidity 0.8.x, now mostly historical but still dangerous in specific contexts.\n\n**Background:**\nSolidity 0.8.0 (2020) introduced checked arithmetic by default. Before that, arithmetic silently wrapped around.\n\n**Modern Contexts Where It Still Bites:**\n\n**1. \`unchecked\` blocks:**\nSolidity 0.8+ allows \`unchecked { ... }\` to skip overflow checks for gas savings. Balance math inside unchecked blocks is dangerous.\n\n**2. Casting truncation:**\n\`\`\`solidity\nuint256 largeAmount = 1e40;\nuint128 truncated = uint128(largeAmount);  // Silently truncates!\n// Always use SafeCast library for explicit bounds checking\n\`\`\`\n\n**3. Precision loss in division:**\n\`\`\`solidity\n// If amount = 1 and totalSupply = 1000:\nuint256 shares = (amount * 1e18) / totalSupply;  // Rounds down to 0!\n// Always multiply before dividing\n\`\`\`\n\n**4. Rounding direction consistency:**\nIn lending protocols, rounding errors must always favour the protocol (round against the user). Inconsistent rounding can be exploited to drain dust that accumulates into meaningful value.`;

    } else if (text.includes("mev") || text.includes("front") || text.includes("sandwich")) {
      explanation = `**MEV: Front-Running, Sandwich Attacks & Transaction Ordering**\n\n**Sandwich Attack Anatomy:**\n1. Victim submits swap: 10 ETH → USDC, 1% slippage tolerance\n2. Searcher sees it in the mempool and front-runs: buy ETH (price goes up)\n3. Victim's swap executes at worse price (within their slippage tolerance)\n4. Searcher back-runs: sell ETH at inflated price\n5. Searcher profits; victim loses to maximum allowed slippage\n\n**Protocol-Level MEV Vectors:**\n- **Liquidation races**: Multiple bots compete to liquidate the same position\n- **Oracle front-running**: Front-run oracle price updates to take profitable positions before the market adjusts\n- **JIT liquidity**: Add liquidity just before a large swap to capture fees, then immediately remove it\n\n**Mitigations:**\n- **Slippage protection**: Enforce minimum output amounts\n- **Commit-reveal schemes**: Two-phase commit-reveal for sensitive operations\n- **Private mempools**: Flashbots Protect, MEV Blocker\n- **TWAP-based execution**: Average price over time for large trades`;

    } else if (text.includes("storage collision") || text.includes("proxy") || text.includes("delegatecall") || text.includes("upgrade")) {
      explanation = `**Storage Collision & Proxy Upgrade Vulnerabilities**\n\n**The Core Problem:**\nIn a proxy pattern, \`delegatecall\` runs implementation code against the proxy's storage. If proxy and implementation have different variable layouts, writes corrupt unintended slots.\n\n**Classic Storage Collision:**\n\`\`\`solidity\ncontract Proxy {\n    address public implementation;  // Slot 0\n}\ncontract ImplementationV1 {\n    address public owner;  // Also Slot 0 — COLLIDES!\n}\n// setOwner() overwrites the implementation address!\n\`\`\`\nSolution: EIP-1967 stores implementation at \`keccak256("eip1967.proxy.implementation") - 1\`.\n\n**Upgrade Risks:**\n- **UUPS unprotected**: If upgrade function lacks access control in new implementation version, anyone upgrades\n- **Uninitialised implementation**: Attacker calls \`initialize()\` directly on implementation, gains ownership, can selfdestruct to brick the proxy\n- **Missing storage gaps**: Adding variables to base contracts in upgrades shifts child contract storage slots\n\n\`\`\`solidity\ncontract BaseV1 {\n    uint256 public value;\n    uint256[49] private __gap;  // Reserve slots for future vars\n}\n\`\`\``;

    } else {
      explanation = `I can explain these vulnerability patterns in depth — each with attack anatomy, real-world examples, and concrete mitigations:\n\n**High impact:**\n- **Reentrancy** — external call before state update ($60M DAO hack)\n- **Flash loan attacks** — borrowed capital to manipulate AMM spot prices ($180M Beanstalk)\n- **Oracle manipulation** — TWAP vs spot price, Chainlink staleness, sequencer downtime\n- **Access control failures** — missing modifiers, wrong role checks, unprotected initialisers\n\n**Common in audits:**\n- **Integer overflow/underflow** — unchecked blocks, unsafe casting, rounding direction\n- **MEV / sandwich attacks** — front-running, transaction ordering exploitation\n- **Storage collision** — proxy upgrade patterns, delegatecall slot conflicts\n\n**Advanced:**\n- **Donation attacks** — first-depositor inflation on ERC-4626 vaults\n- **Cross-contract reentrancy** — shared state exploited across contracts\n- **Governance attacks** — flash-borrow voting power for same-block proposals\n\nWhich pattern would you like me to break down?`;
    }

    await callback({
      text: explanation,
      action: "EXPLAIN_VULNERABILITY",
    });
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Explain reentrancy attacks to me" },
      },
      {
        name: "Axiom",
        content: {
          text: "**Reentrancy** — Classic DeFi attack vector. $60M lost in the DAO hack alone...",
          action: "EXPLAIN_VULNERABILITY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "How do flash loan attacks work?" },
      },
      {
        name: "Axiom",
        content: {
          text: "**Flash Loan Attacks** — Uncollateralised capital weaponised against oracle-dependent protocols...",
          action: "EXPLAIN_VULNERABILITY",
        },
      },
    ],
  ],
};

/**
 * DeFi Protocol TVL Scanner
 * Fetches live TVL data from DefiLlama for top protocols
 */
const defiTvlScanAction = {
  name: "SCAN_DEFI_TVL",
  description: "Fetch live TVL rankings and protocol data from DefiLlama to identify top DeFi protocols by category",
  similes: ["TVL_SCAN", "DEFI_RANKINGS", "TOP_PROTOCOLS", "PROTOCOL_TVL", "DEFI_MARKET"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";
    return (
      text.includes("tvl") ||
      text.includes("top protocol") ||
      text.includes("biggest defi") ||
      text.includes("defi ranking") ||
      text.includes("defi market") ||
      text.includes("protocol list") ||
      text.includes("largest protocol")
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";

    // Determine category filter
    const isLending = /lend|borrow|money market/i.test(text);
    const isDex = /dex|swap|amm|exchange/i.test(text);
    const isYield = /yield|farm|vault/i.test(text);

    try {
      type Protocol = {
        name: string;
        tvl: number;
        category: string;
        chain: string;
        change_1d?: number;
        change_7d?: number;
      };

      const response = await fetch("https://api.llama.fi/protocols", {
        headers: { "User-Agent": "Axiom/1.0" },
      });

      if (!response.ok) {
        await callback({ text: "Could not reach DefiLlama API. Try https://defillama.com directly." });
        return;
      }

      const protocols = await response.json() as Protocol[];
      let filtered = protocols.filter(p => p.tvl > 0);

      if (isLending) {
        filtered = filtered.filter(p => /lending|cdp|money market/i.test(p.category));
      } else if (isDex) {
        filtered = filtered.filter(p => /dex|amm/i.test(p.category));
      } else if (isYield) {
        filtered = filtered.filter(p => /yield|farm|vault/i.test(p.category));
      }

      const top10 = filtered
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 10);

      const formatTvl = (tvl: number) => {
        if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(2)}B`;
        if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(0)}M`;
        return `$${tvl.toFixed(0)}`;
      };

      const category = isLending ? "Lending" : isDex ? "DEX/AMM" : isYield ? "Yield" : "All Categories";
      const lines = top10.map((p, i) => {
        const change = p.change_1d != null ? ` | 24h: ${p.change_1d > 0 ? "+" : ""}${p.change_1d.toFixed(1)}%` : "";
        return `${i + 1}. **${p.name}** — TVL: ${formatTvl(p.tvl)} | ${p.category}${change}`;
      });

      await callback({
        text: `## DeFi TVL Rankings — ${category}\n*Live data from DefiLlama*\n\n${lines.join("\n")}\n\n> Ask me to \`ASSESS_PROTOCOL_RISK\` on any of these, or use \`SCAN_BOUNTIES\` to find security programs.`,
        action: "SCAN_DEFI_TVL",
      });
    } catch (err) {
      await callback({
        text: `Error fetching TVL data: ${err instanceof Error ? err.message : String(err)}. Check https://defillama.com for live data.`,
      });
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What are the top DeFi protocols by TVL?" },
      },
      {
        name: "Axiom",
        content: {
          text: "## DeFi TVL Rankings — All Categories\n\n1. **Lido** — TVL: $28.5B | Liquid Staking...",
          action: "SCAN_DEFI_TVL",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me top lending protocols by TVL" },
      },
      {
        name: "Axiom",
        content: {
          text: "## DeFi TVL Rankings — Lending\n\n1. **Aave** — TVL: $12.1B...",
          action: "SCAN_DEFI_TVL",
        },
      },
    ],
  ],
};

/**
 * Smart Contract Address Inspector
 * Fetches on-chain contract info from Etherscan/Blockscout
 */
const contractInspectorAction = {
  name: "INSPECT_CONTRACT",
  description: "Fetch on-chain info for a smart contract address: balance, transaction count, verified source, and creation date",
  similes: ["CONTRACT_INFO", "CHECK_CONTRACT", "ANALYSE_ADDRESS", "LOOKUP_CONTRACT", "ETHERSCAN"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text ?? "";
    // Match Ethereum addresses: 0x followed by 40 hex chars
    return /0x[0-9a-fA-F]{40}/.test(text);
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const text = (message.content as { text?: string }).text ?? "";
    const addressMatch = text.match(/0x[0-9a-fA-F]{40}/);

    if (!addressMatch) {
      await callback({ text: "No Ethereum address found. Provide a 0x address to inspect." });
      return;
    }

    const address = addressMatch[0];

    try {
      // Etherscan-compatible API (public endpoint — no API key needed for basic info)
      const apiBase = "https://api.etherscan.io/api";

      type EtherscanResponse = { status: string; result: string | Array<unknown> };

      const [balanceRes, txCountRes, sourceRes] = await Promise.allSettled([
        fetch(`${apiBase}?module=account&action=balance&address=${address}&tag=latest`),
        fetch(`${apiBase}?module=proxy&action=eth_getTransactionCount&address=${address}&tag=latest`),
        fetch(`${apiBase}?module=contract&action=getsourcecode&address=${address}`),
      ]);

      let balance = "N/A";
      let txCount = "N/A";
      let isVerified = false;
      let contractName = "Unknown";
      let compiler = "N/A";

      if (balanceRes.status === "fulfilled" && balanceRes.value.ok) {
        const data = await balanceRes.value.json() as EtherscanResponse;
        if (data.status === "1" && typeof data.result === "string") {
          const wei = BigInt(data.result);
          const eth = Number(wei) / 1e18;
          balance = `${eth.toFixed(4)} ETH`;
        }
      }

      if (txCountRes.status === "fulfilled" && txCountRes.value.ok) {
        const data = await txCountRes.value.json() as EtherscanResponse;
        if (typeof data.result === "string") {
          txCount = parseInt(data.result, 16).toLocaleString();
        }
      }

      type SourceResult = { SourceCode?: string; ContractName?: string; CompilerVersion?: string };
      if (sourceRes.status === "fulfilled" && sourceRes.value.ok) {
        const data = await sourceRes.value.json() as { status: string; result: SourceResult[] };
        if (data.status === "1" && Array.isArray(data.result) && data.result[0]) {
          const src = data.result[0];
          isVerified = !!(src.SourceCode && src.SourceCode !== "");
          contractName = src.ContractName || "Unknown";
          compiler = src.CompilerVersion || "N/A";
        }
      }

      const explorerLink = `https://etherscan.io/address/${address}`;

      await callback({
        text: `## Contract Inspector: \`${address}\`\n\n` +
          `**Balance:** ${balance}\n` +
          `**Transactions:** ${txCount}\n` +
          `**Verified Source:** ${isVerified ? `✅ Yes — \`${contractName}\` (${compiler})` : "❌ Not verified"}\n\n` +
          `**Etherscan:** ${explorerLink}\n\n` +
          `${isVerified
            ? `> Source is verified. Use \`ASSESS_PROTOCOL_RISK\` with the GitHub repo for deeper analysis.`
            : `> ⚠️ Source not verified — contract behaviour cannot be audited from bytecode alone.`
          }`,
        action: "INSPECT_CONTRACT",
      });
    } catch (err) {
      await callback({
        text: `Error inspecting ${address}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Inspect contract 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
      },
      {
        name: "Axiom",
        content: {
          text: "## Contract Inspector: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`\n\n**Balance:** 0.0000 ETH\n**Verified Source:** ✅ Yes — `FiatTokenProxy`",
          action: "INSPECT_CONTRACT",
        },
      },
    ],
  ],
};

/**
 * DeFi Exploit History Database
 * Retrieves historical exploit records for DeFi protocols
 */
const exploitHistoryAction = {
  name: "EXPLOIT_HISTORY",
  description: "Retrieve historical DeFi exploit and hack records — amounts lost, attack vectors, post-mortems",
  similes: ["HACK_HISTORY", "PAST_EXPLOITS", "SECURITY_INCIDENTS", "DEFI_HACKS", "HISTORICAL_EXPLOITS"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";
    return (
      text.includes("exploit history") ||
      text.includes("past hack") ||
      text.includes("historical exploit") ||
      text.includes("defi hack") ||
      text.includes("security incident") ||
      text.includes("biggest hack") ||
      text.includes("largest exploit") ||
      (text.includes("exploit") && (text.includes("list") || text.includes("show") || text.includes("what")))
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";

    // Curated exploit database (top DeFi exploits by impact)
    const exploits = [
      { date: "2022-03-23", protocol: "Ronin Bridge (Axie)", amount: 625_000_000, vector: "Compromised validator keys", chain: "Ethereum" },
      { date: "2022-02-02", protocol: "Wormhole Bridge", amount: 320_000_000, vector: "Signature verification bypass on Solana", chain: "Solana" },
      { date: "2022-04-17", protocol: "Beanstalk Farms", amount: 182_000_000, vector: "Flash loan governance attack", chain: "Ethereum" },
      { date: "2022-10-07", protocol: "Binance Bridge (BSC)", amount: 120_000_000, vector: "Proof verification exploit", chain: "BSC" },
      { date: "2022-10-11", protocol: "Mango Markets", amount: 117_000_000, vector: "Price oracle manipulation", chain: "Solana" },
      { date: "2022-09-02", protocol: "Wintermute", amount: 162_000_000, vector: "Vanity address private key compromise", chain: "Ethereum" },
      { date: "2021-08-10", protocol: "Poly Network", amount: 611_000_000, vector: "Cross-chain message validation flaw", chain: "Multi-chain" },
      { date: "2021-12-02", protocol: "BadgerDAO", amount: 120_000_000, vector: "Frontend injection (Cloudflare Workers)", chain: "Ethereum" },
      { date: "2021-05-20", protocol: "PancakeBunny", amount: 45_000_000, vector: "Flash loan price manipulation", chain: "BSC" },
      { date: "2020-10-26", protocol: "Harvest Finance", amount: 34_000_000, vector: "AMM spot price manipulation during flash loan", chain: "Ethereum" },
      { date: "2020-02-15", protocol: "bZx (x2)", amount: 1_000_000, vector: "First major flash loan attacks", chain: "Ethereum" },
      { date: "2016-06-17", protocol: "The DAO", amount: 60_000_000, vector: "Reentrancy (led to Ethereum hard fork)", chain: "Ethereum" },
    ];

    let filtered = exploits;

    // Filter by protocol name if mentioned
    const protocolFilter = text.match(/(?:exploit|hack)(?:s?)\s+(?:on\s+|for\s+|of\s+)?([a-z0-9\s]+?)(?:\s+protocol|\s+bridge|\s+farm|\s*$)/i);
    if (protocolFilter?.[1]) {
      const filter = protocolFilter[1].trim().toLowerCase();
      filtered = exploits.filter(e => e.protocol.toLowerCase().includes(filter));
    }

    // Filter by chain
    if (text.includes("solana")) filtered = exploits.filter(e => e.chain === "Solana");
    else if (text.includes("bsc") || text.includes("binance")) filtered = exploits.filter(e => e.chain === "BSC");

    // Sort by amount descending
    filtered = filtered.sort((a, b) => b.amount - a.amount).slice(0, 8);

    if (filtered.length === 0) {
      await callback({ text: "No matching exploits found in my database. Try: 'Show me the biggest DeFi hacks' or 'Solana exploits'." });
      return;
    }

    const formatAmount = (n: number) => {
      if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
      return `$${n.toLocaleString()}`;
    };

    const lines = filtered.map((e, i) =>
      `${i + 1}. **${e.protocol}** (${e.date}) — **${formatAmount(e.amount)}** lost\n   Vector: ${e.vector} | Chain: ${e.chain}`
    );

    const total = filtered.reduce((s, e) => s + e.amount, 0);

    await callback({
      text: `## DeFi Exploit History\n\n${lines.join("\n\n")}\n\n---\n**Total in this list:** ${formatAmount(total)}\n\n> Use \`EXPLAIN_VULNERABILITY\` for a deep-dive into any attack vector above.`,
      action: "EXPLOIT_HISTORY",
    });
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me the biggest DeFi hacks ever" },
      },
      {
        name: "Axiom",
        content: {
          text: "## DeFi Exploit History\n\n1. **Ronin Bridge** (2022-03-23) — **$625M** lost\n   Vector: Compromised validator keys...",
          action: "EXPLOIT_HISTORY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "List historical exploits on Solana" },
      },
      {
        name: "Axiom",
        content: {
          text: "## DeFi Exploit History\n\n1. **Wormhole Bridge** (2022-02-02) — **$320M** lost...",
          action: "EXPLOIT_HISTORY",
        },
      },
    ],
  ],
};

/**
 * Axiom DeFi Intelligence Plugin
 */
export const customPlugin: Plugin = {
  name: "axiom-defi-intelligence",
  description: "DeFi security intelligence — protocol risk assessment, vulnerability education, TVL scanning, contract inspection, and exploit history",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: [protocolRiskAction, vulnExplainerAction, defiTvlScanAction, contractInspectorAction, exploitHistoryAction] as any[],
  providers: [],
  evaluators: [],
};

export default customPlugin;
