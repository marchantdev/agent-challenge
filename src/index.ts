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
      text: `**Axiom Risk Assessment Framework: ${protocolName}**\n\nI'll walk through the systematic analysis. For a complete assessment, I'd need the contract addresses or source code — but here's the framework I apply:\n\n**1. Trust Model Analysis**\n- Who are the privileged actors? (Owner, admin, timelock, multisig)\n- What can they do unilaterally? (Pause, upgrade, change parameters, drain funds)\n- Is there a timelock? What's the delay?\n\n**2. Invariant Identification**\n- What must always be true? (Total debt ≤ total collateral, share value monotonic, etc.)\n- Which functions can break these invariants?\n- Are invariants checked or just assumed?\n\n**3. Economic Attack Surface**\n- Can price oracles be manipulated? (TWAP vs spot, flash loan attack vectors)\n- Are there donation attacks (inflating exchange rates by direct transfers)?\n- Can the protocol be drained via arbitrage against stale prices?\n\n**4. Composability Risks**\n- What external calls does the protocol make?\n- Can any called contract be paused, bricked, or replaced?\n- Are there reentrancy vectors (state changes after external calls)?\n\n**5. Upgrade Risk**\n- Is the contract upgradeable? Via proxy pattern?\n- Who controls upgrades? What's the governance process?\n- Can storage slots be corrupted by upgrades?\n\nIf you share the contract address or GitHub repo, I can give you specific findings rather than a generic framework.",
      action: "ASSESS_PROTOCOL_RISK",
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Can you assess the risk of this Aave fork?" },
      },
      {
        user: "Axiom",
        content: {
          text: "**Axiom Risk Assessment Framework: Aave fork**\n\nI'll walk through the systematic analysis...",
          action: "ASSESS_PROTOCOL_RISK",
        },
      },
    ],
  ],
};

/**
 * Vulnerability Pattern Explainer
 * Gives structured explanations of smart contract vulnerability classes
 */
const vulnExplainerAction = {
  name: "EXPLAIN_VULNERABILITY",
  description: "Explain a smart contract vulnerability pattern with examples and mitigations",
  similes: ["VULN_EXPLAIN", "SECURITY_CONCEPT", "EXPLAIN_ATTACK", "HOW_DOES_ATTACK_WORK"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content as { text?: string }).text?.toLowerCase() ?? "";
    const vulnKeywords = [
      "reentrancy", "flash loan", "price manipulation", "oracle", "overflow",
      "underflow", "access control", "front.?run", "sandwich", "mev",
      "storage collision", "proxy", "delegatecall", "selfdestruct",
      "integer", "rounding", "inflation attack", "donation attack"
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
    
    let vulnType = "unknown vulnerability";
    let explanation = "";

    if (text.includes("reentrancy")) {
      vulnType = "Reentrancy";
      explanation = `**Reentrancy** — Classic DeFi attack vector ($60M+ lost to date)\n\n**The Pattern:**\nA contract calls an external address before updating its own state. The external address calls back into the original contract before the first execution completes, seeing stale state.\n\n**Classic Example (DAO Hack 2016):**\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);\n    (bool success,) = msg.sender.call{value: amount}("");  // External call first\n    balances[msg.sender] -= amount;  // State update AFTER — too late!\n}\n\`\`\`\nAttacker deploys a contract with a \`receive()\` that calls \`withdraw()\` again before balance is decremented.\n\n**The Fix:**\nChecks-Effects-Interactions pattern — update state BEFORE external calls:\n\`\`\`solidity\nfunction withdraw(uint amount) external {\n    require(balances[msg.sender] >= amount);\n    balances[msg.sender] -= amount;  // Effect first\n    (bool success,) = msg.sender.call{value: amount}("");  // Then interact\n}\n\`\`\`\nOr use OpenZeppelin's \`ReentrancyGuard\` with the \`nonReentrant\` modifier.\n\n**Modern variants:** Cross-function reentrancy (entering a different function), cross-contract reentrancy (through shared state), read-only reentrancy (ERC-4626 price manipulation via view functions during execution).`;
    } else if (text.includes("flash loan")) {
      vulnType = "Flash Loan Attack";
      explanation = `**Flash Loan Attacks** — Borrowed capital used to manipulate protocol state\n\n**What makes them dangerous:**\nFlash loans give attackers billions in uncollateralised capital for a single transaction. This isn't a vulnerability in flash loans themselves — it's that protocols assume manipulating state requires capital the attacker doesn't have.\n\n**Common Targets:**\n1. **AMM spot prices used as oracles**: Borrow $100M USDC, swap to ETH in Uniswap pool, borrow against inflated ETH price, default. Mango Markets hack ($117M) used this pattern on Solana.\n2. **Governance attacks**: Flash borrow enough tokens to pass a malicious proposal in a single block (if protocol allows immediate execution).\n3. **Liquidation cascade manipulation**: Temporarily suppress collateral price to trigger mass liquidations at discount.\n\n**The Fix:**\nUse time-weighted average prices (TWAPs) over multiple blocks — not spot prices. Flash loans operate within one block. A TWAP of 30 minutes can't be manipulated by a single transaction.\n\n**Code smell to watch for:**\n\`\`\`solidity\n// DANGEROUS — spot price\nfunction getPrice() returns (uint) {\n    (uint reserve0, uint reserve1,) = pair.getReserves();\n    return reserve1 / reserve0;  // Manipulable in same tx!\n}\n\`\`\``;
    } else {
      vulnType = "Smart Contract Vulnerability";
      explanation = `I can explain specific vulnerability patterns in depth. Some common ones:\n\n- **Reentrancy** — external call before state update\n- **Flash loan attacks** — borrowed capital to manipulate AMM spot prices\n- **Oracle manipulation** — TWAP vs spot price attacks\n- **Access control failures** — missing \`onlyOwner\`/\`onlyRole\` checks\n- **Integer overflow/underflow** — pre-Solidity 0.8.x arithmetic\n- **Storage collision** — proxy patterns with misaligned storage\n- **Front-running / MEV** — transaction ordering manipulation\n- **Donation attacks** — first-depositor share inflation\n\nWhich would you like me to break down?`;
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
        user: "{{user1}}",
        content: { text: "Explain reentrancy attacks to me" },
      },
      {
        user: "Axiom",
        content: {
          text: "**Reentrancy** — Classic DeFi attack vector ($60M+ lost to date)...",
          action: "EXPLAIN_VULNERABILITY",
        },
      },
    ],
  ],
};

/**
 * Your custom plugin — Axiom DeFi Intelligence
 */
export const customPlugin: Plugin = {
  name: "axiom-defi-intelligence",
  description: "DeFi security analysis and smart contract vulnerability explainer",
  actions: [protocolRiskAction, vulnExplainerAction],
  providers: [],
  evaluators: [],
};

export default customPlugin;
