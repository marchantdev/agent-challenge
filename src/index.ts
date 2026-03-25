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
  ) => {
    const text = (message.content as { text?: string }).text ?? "";

    // Extract protocol name if mentioned
    const protocolMatch = text.match(/(?:audit|assess|review|check|analyse|analyze)\s+([A-Za-z0-9\s]+?)(?:\s+protocol|\s+contract|\s+vault|\s*$)/i);
    const protocolName = protocolMatch?.[1]?.trim() ?? "the protocol";

    await callback({
      text: `**Axiom Risk Assessment Framework: ${protocolName}**\n\nI apply a 5-layer analysis. For specific findings I need the contract addresses or source — here's the framework:\n\n**1. Trust Model Analysis**\n- Who are the privileged actors? (Owner, admin, timelock, multisig, DAO)\n- What can they do unilaterally? (Pause, upgrade, change parameters, drain funds)\n- Is there a timelock? What's the delay — hours or days?\n- Can a single private key drain the protocol?\n\n**2. Invariant Identification**\n- What must always be true? (Total debt ≤ total collateral, share price monotonically increasing, etc.)\n- Which functions can break these invariants?\n- Are invariants asserted or merely assumed?\n\n**3. Economic Attack Surface**\n- Can price oracles be manipulated? (TWAP vs spot price, flash loan vectors)\n- Are there donation attacks? (Direct token transfers inflating exchange rates — ERC-4626 first depositor)\n- Can the protocol be arbitraged against stale prices?\n- What happens if the peg breaks? What cascades?\n\n**4. Composability Risks**\n- What external contracts does this protocol call?\n- Can any dependency be paused, bricked, or drained?\n- Are there reentrancy vectors? (state updates AFTER external calls)\n- Does the protocol correctly handle ERC-20 tokens that return false instead of reverting?\n\n**5. Upgrade & Governance Risk**\n- Is the contract upgradeable? Which proxy pattern (Transparent, UUPS, Beacon)?\n- Who controls upgrades — EOA, multisig, or timelock DAO?\n- Can storage slots be corrupted by an upgrade? (check for storage gaps in inherited contracts)\n- What's the governance attack surface? (Flash-borrowable governance tokens?)\n\nShare the contract address or GitHub repo and I'll give you specific findings rather than a generic framework.`,
      action: "ASSESS_PROTOCOL_RISK",
    });
    return true;
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
  ) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";

    let explanation = "";

    if (text.includes("reentrancy")) {
      explanation = `**Reentrancy** — Classic DeFi attack vector. $60M lost in the DAO hack alone.\n\n**The Pattern:**\nA contract calls an external address before updating its own state. The external address calls back into the original contract before the first execution completes, seeing stale (pre-update) state.\n\n**Classic Example (The DAO, 2016):**\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);\n    (bool success,) = msg.sender.call{value: amount}(""); // External call first!\n    balances[msg.sender] -= amount;  // State update AFTER — already too late\n}\n\`\`\`\nAttacker deploys a contract whose \`receive()\` calls \`withdraw()\` again before balance is decremented. Loops until the victim is drained.\n\n**Modern Variants:**\n- **Cross-function reentrancy**: Enter a different function (not the same one) that reads stale state\n- **Cross-contract reentrancy**: Two contracts share state; reentrancy path goes through the shared state\n- **Read-only reentrancy**: ERC-4626 vault price can be manipulated mid-execution via view functions called during an ongoing transaction (Curve exploit 2023)\n\n**The Fix — Checks-Effects-Interactions:**\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);  // Check\n    balances[msg.sender] -= amount;            // Effect FIRST\n    (bool success,) = msg.sender.call{value: amount}(""); // Then interact\n    require(success, "Transfer failed");\n}\n\`\`\`\nOr use OpenZeppelin's \`ReentrancyGuard\` with \`nonReentrant\` modifier as belt-and-suspenders.`;

    } else if (text.includes("flash loan")) {
      explanation = `**Flash Loan Attacks** — Uncollateralised capital weaponised against oracle-dependent protocols.\n\n**What makes them dangerous:**\nFlash loans give attackers effectively unlimited capital within a single transaction. This isn't a bug in flash loans — it's that protocols assume market manipulation requires sustained capital the attacker doesn't have.\n\n**Anatomy of a Flash Loan Attack:**\n1. Borrow $100M USDC from Aave (0 collateral, must repay in same tx)\n2. Swap $100M USDC → ETH in the target AMM (spot price now massively inflated)\n3. Borrow against inflated ETH price on the victim lending protocol\n4. Leave with borrowed funds, default on collateral\n5. Repay $100M flash loan + fee\n6. Net: extracted protocol funds at zero upfront cost\n\n**Real Examples:**\n- **Mango Markets** ($117M, Solana, Oct 2022): Flash-borrowed MNGO tokens, pumped own oracle price, borrowed against inflated collateral\n- **Beanstalk** ($180M, Apr 2022): Flash-borrowed enough tokens to achieve 2/3 supermajority in governance, passed malicious proposal in same block\n- **Harvest Finance** ($34M, Oct 2020): AMM spot price manipulation during flash loan to exploit stale USDC/USDT rate\n\n**The Fixes:**\n- Use **TWAPs** (time-weighted average prices) over 30+ minutes — single-block manipulation becomes economically infeasible\n- For governance: require a **timelock** between proposal and execution — flash-borrowed votes can't hold tokens for the delay period\n- Never use AMM spot prices as oracle inputs for anything that affects protocol solvency`;

    } else if (text.includes("oracle") || text.includes("price manipulation")) {
      explanation = `**Oracle Manipulation & Price Feed Attacks** — The single largest source of DeFi losses.\n\n**Why Oracles Are Critical:**\nOracles are the bridge between off-chain prices and on-chain protocol state. If an attacker can move the price an oracle reports, they can break any protocol that uses that price for collateral valuation, liquidation thresholds, or peg mechanics.\n\n**Types of Oracle Attacks:**\n\n**1. AMM Spot Price Manipulation**\nUsing an AMM pool as a price oracle is catastrophically dangerous:\n\`\`\`solidity\n// NEVER DO THIS\nfunction getPrice() view returns (uint) {\n    (uint r0, uint r1,) = IUniswapV2Pair(pair).getReserves();\n    return r1 * 1e18 / r0;  // Spot price — manipulable in one tx!\n}\n\`\`\`\nFix: Use Uniswap V3 TWAP with a minimum 30-minute window.\n\n**2. Chainlink Heartbeat Staleness**\nChainlink has a heartbeat (1h or 24h) and deviation threshold (0.5%). A price can be stale by hours without triggering an update. If a lending protocol doesn't check the \`updatedAt\` timestamp:\n\`\`\`solidity\n// Missing staleness check — dangerous\n(, int price,,,) = priceFeed.latestRoundData();\n// Should be:\n(, int price,, uint updatedAt,) = priceFeed.latestRoundData();\nrequire(block.timestamp - updatedAt < 3600, "Stale price");\n\`\`\`\n\n**3. Price Feed Sequencer Downtime (L2s)**\nOn Arbitrum/Optimism, the sequencer can go offline. Chainlink has a sequencer uptime feed — protocols must check it before trusting any price. Synthetix has been exploited via this vector.\n\n**4. Composite Oracle Attacks**\nWhen protocol value depends on price_A AND price_B (e.g. a stablecoin LP), manipulating either component is sufficient. LP token pricing requires querying both reserve tokens' prices separately.`;

    } else if (text.includes("access control")) {
      explanation = `**Access Control Failures** — The most common class of critical/high severity findings.\n\n**What it is:**\nA function that should be restricted (admin-only, owner-only, role-gated) is callable by anyone, or is callable by the wrong set of principals.\n\n**Common Patterns:**\n\n**1. Missing modifier entirely:**\n\`\`\`solidity\n// VULNERABLE — anyone can call this\nfunction setFeeRecipient(address newRecipient) external {\n    feeRecipient = newRecipient;\n}\n\n// FIXED\nfunction setFeeRecipient(address newRecipient) external onlyOwner {\n    feeRecipient = newRecipient;\n}\n\`\`\`\n\n**2. Incorrect role check:**\n\`\`\`solidity\n// VULNERABLE — checks wrong role\nfunction pause() external {\n    require(hasRole(ADMIN_ROLE, msg.sender)); // Should be PAUSER_ROLE\n    _pause();\n}\n\`\`\`\n\n**3. Initialiser not protected:**\n\`\`\`solidity\n// VULNERABLE — anyone can reinitialise a proxy\nfunction initialize(address admin) external {\n    owner = admin;  // Missing initializer guard!\n}\n// Fix: use OpenZeppelin Initializable with initializer modifier\n\`\`\`\n\n**4. Two-step ownership transfer skipped:**\nIf \`transferOwnership()\` is immediate (not two-step), a typo in the new owner address permanently locks admin functions. OpenZeppelin's \`Ownable2Step\` requires the new owner to accept.\n\n**5. Permissionless state changes affecting protocol invariants (real bounty finding class):**\nA public function that changes a parameter affecting fee calculations, collateral ratios, or reward distribution — with no access control — can be called by any user to grief the protocol or redirect value.\n\n**What to look for in audits:**\n- Every \`external\` or \`public\` function that changes state: does it need access control?\n- Every \`initialize()\` function: is it protected from re-initialisation?\n- Every admin function: is the role granular enough? (UPGRADER shouldn't equal PAUSER)\n- Two-step patterns for high-impact operations (ownership transfer, key parameter changes)`;

    } else if (text.includes("overflow") || text.includes("underflow") || text.includes("integer")) {
      explanation = `**Integer Overflow & Underflow** — Pre-Solidity 0.8.x, now mostly historical but still dangerous in specific contexts.\n\n**Background:**\nSolidity 0.8.0 (2020) introduced checked arithmetic by default. Before that, arithmetic silently wrapped around. \`uint8(255) + 1 = 0\`.\n\n**Classic Pattern (pre-0.8.x):**\n\`\`\`solidity\n// VULNERABLE in Solidity <0.8.0\nfunction withdraw(uint256 amount) external {\n    balances[msg.sender] -= amount;  // If amount > balance: wraps to uint max!\n    token.transfer(msg.sender, amount);\n}\n// Fix: use SafeMath (OpenZeppelin) or upgrade to Solidity >=0.8\n\`\`\`\n\n**Modern Contexts Where It Still Bites:**\n\n**1. \`unchecked\` blocks:**\nSolidity 0.8+ allows \`unchecked { ... }\` to skip overflow checks for gas savings. Developers using this for loop counters sometimes accidentally apply it to balance math.\n\n**2. Casting truncation:**\n\`\`\`solidity\nuint256 largeAmount = 1e40;\nuint128 truncated = uint128(largeAmount);  // Silently truncates!\n// Always use SafeCast library for explicit bounds checking\n\`\`\`\n\n**3. Precision loss in division:**\n\`\`\`solidity\n// If amount = 1 and totalSupply = 1000:\nuint256 shares = (amount * 1e18) / totalSupply;  // Rounds down to 0!\n// Always multiply before dividing\n\`\`\`\n\n**4. Rounding direction consistency:**\nIn lending protocols, rounding errors must always favour the protocol. Minting shares should round DOWN for the user; burning/withdrawing should round DOWN for the user. Inconsistent rounding can be exploited to drain dust that accumulates into meaningful value.`;

    } else if (text.includes("mev") || text.includes("front") || text.includes("sandwich")) {
      explanation = `**MEV: Front-Running, Sandwich Attacks & Transaction Ordering**\n\n**What is MEV?**\nMaximal Extractable Value — profit captured by controlling transaction ordering. Miners/validators (and searchers via Flashbots) can reorder, insert, or censor transactions within a block.\n\n**Sandwich Attack Anatomy:**\n1. Victim submits swap: 10 ETH → USDC, 1% slippage tolerance\n2. Searcher sees it in the mempool\n3. Searcher front-runs: buy ETH (price goes up)\n4. Victim's swap executes at worse price (within their slippage tolerance)\n5. Searcher back-runs: sell ETH at inflated price\n6. Searcher profits; victim loses to maximum allowed slippage\n\n**Protocol-Level MEV Vectors:**\n- **Liquidation races**: Multiple bots compete to liquidate the same position. Only first wins.\n- **Arbitrage**: Stale prices between venues. Permissionless price feeds can be used to extract value before price settles.\n- **Oracle updates**: Front-running oracle price updates to take profitable positions before the rest of the market adjusts.\n- **JIT liquidity**: Adding liquidity just before a large swap to capture fees, then immediately removing it.\n\n**Mitigations:**\n- **Slippage protection**: Always set meaningful slippage tolerance. Protocols should enforce minimum output amounts.\n- **Commit-reveal schemes**: For sensitive operations where order matters, use a two-phase commit-reveal\n- **Private mempools**: Flashbots Protect, MEV Blocker — submits transactions that skip the public mempool\n- **TWAP-based execution**: For large trades, split across time to average execution price\n- **Batch auctions**: CoW Protocol / Gnosis Auction batch orders for uniform clearing price`;

    } else if (text.includes("storage collision") || text.includes("proxy") || text.includes("delegatecall") || text.includes("upgrade")) {
      explanation = `**Storage Collision & Proxy Upgrade Vulnerabilities**\n\n**How Delegatecall Works:**\nIn a proxy pattern, the proxy delegates all calls to an implementation contract via \`delegatecall\`. The implementation's code runs, but reads and writes the **proxy's** storage slots. If the proxy and implementation have different variable layouts, writes go to wrong slots.\n\n**Storage Collision Attack:**\n\`\`\`solidity\n// Proxy contract — only stores implementation address\ncontract Proxy {\n    address public implementation;  // Slot 0\n}\n\n// Implementation (old version)\ncontract ImplementationV1 {\n    address public owner;  // Slot 0 — COLLIDES with implementation!\n}\n// setOwner() actually overwrites the implementation address!\n\`\`\`\nThis is why OpenZeppelin Transparent Proxy uses EIP-1967 to store implementation at a specific pseudo-random slot: \`keccak256("eip1967.proxy.implementation") - 1\`.\n\n**UUPS vs Transparent Proxy Risk:**\n- **Transparent**: upgrade logic in proxy, protected by admin address. If admin=implementation, DoS.\n- **UUPS**: upgrade logic in implementation. If upgradeable function is left unprotected in a new version, anyone can upgrade. If implementation is selfdestruct-able, proxy becomes permanent brick.\n\n**Initialisation Attacks:**\nProxy implementation contracts must be initialised, not constructed. If the implementation contract itself is not initialised separately (only the proxy is), an attacker can call \`initialize()\` directly on the implementation and gain ownership — then potentially use \`selfdestruct\` to break the proxy.\n\n**Storage Gap Pattern (Inheritance):**\n\`\`\`solidity\ncontract BaseV1 {\n    uint256 public value;\n    uint256[49] private __gap;  // Reserve 49 slots for future use\n}\n// Adding variables in BaseV2 fills gap slots, no collision\n\`\`\`\nWithout \`__gap\`, adding variables to a base contract in an upgrade shifts all storage slots in child contracts, corrupting state.`;

    } else {
      explanation = `I can explain these vulnerability patterns in depth — each with attack anatomy, real-world examples, and concrete mitigations:\n\n**High impact:**\n- **Reentrancy** — external call before state update ($60M DAO hack)\n- **Flash loan attacks** — borrowed capital to manipulate AMM spot prices ($180M Beanstalk)\n- **Oracle manipulation** — TWAP vs spot price, Chainlink staleness, sequencer downtime\n- **Access control failures** — missing modifiers, wrong role checks, unprotected initialisers\n\n**Common in audits:**\n- **Integer overflow/underflow** — unchecked blocks, unsafe casting, rounding direction\n- **MEV / sandwich attacks** — front-running, transaction ordering exploitation\n- **Storage collision** — proxy upgrade patterns, delegatecall slot conflicts\n- **Donation attacks** — first-depositor inflation on ERC-4626 vaults\n\n**Advanced:**\n- **Cross-contract reentrancy** — shared state exploited across contracts\n- **Read-only reentrancy** — view functions called mid-execution (Curve 2023)\n- **Governance attacks** — flash-borrow voting power for same-block proposals\n- **Composability risks** — protocol dependency on pauseable/upgradeable external contracts\n\nWhich pattern would you like me to break down?`;
    }

    await callback({
      text: explanation,
      action: "EXPLAIN_VULNERABILITY",
    });
    return true;
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
    [
      {
        name: "{{user1}}",
        content: { text: "What is oracle manipulation?" },
      },
      {
        name: "Axiom",
        content: {
          text: "**Oracle Manipulation & Price Feed Attacks** — The single largest source of DeFi losses...",
          action: "EXPLAIN_VULNERABILITY",
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
  description: "DeFi security analysis — protocol risk assessment and smart contract vulnerability explanation",
  actions: [protocolRiskAction, vulnExplainerAction],
  providers: [],
  evaluators: [],
};

export default customPlugin;
