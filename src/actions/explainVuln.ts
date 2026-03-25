/**
 * EXPLAIN_VULNERABILITY
 * Explains DeFi vulnerability types with real-world exploit examples.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, HandlerOptions } from "@elizaos/core";

interface VulnInfo {
  type: string;
  description: string;
  realExamples: { name: string; amount: string; date: string; detail: string }[];
  mitigation: string[];
  codeExample?: string;
}

const VULN_DATABASE: Record<string, VulnInfo> = {
  reentrancy: {
    type: "Reentrancy Attack",
    description: "An attacker exploits a contract that makes an external call before updating its state, allowing recursive re-entry to drain funds.",
    realExamples: [
      { name: "The DAO", amount: "$60M", date: "2016-06-17", detail: "Classic reentrancy via recursive fallback in withdrawal function." },
      { name: "Curve Finance", amount: "$73.5M", date: "2023-07-30", detail: "Vyper compiler bug caused reentrancy locks to fail in pools using affected versions." },
      { name: "Cream Finance", amount: "$130M", date: "2021-10-27", detail: "Flash loan reentrancy through token callbacks during collateral calculation." },
    ],
    mitigation: [
      "Use checks-effects-interactions pattern (update state BEFORE external calls)",
      "Implement reentrancy guards (OpenZeppelin ReentrancyGuard)",
      "Avoid `call.value()` — use `transfer()` or `send()` for simple ETH transfers",
      "Audit all callback hooks (ERC-777, ERC-1155, flash loans) for re-entry vectors",
    ],
  },
  "flash loan": {
    type: "Flash Loan Attack",
    description: "Attacker borrows a massive amount with zero collateral in a single transaction to manipulate prices, governance, or protocol state.",
    realExamples: [
      { name: "Beanstalk", amount: "$182M", date: "2022-04-17", detail: "Flash loan used to acquire governance tokens, pass malicious proposal, and drain treasury in one tx." },
      { name: "Euler Finance", amount: "$197M", date: "2023-03-13", detail: "Flash loan + donation attack bypassed health factor checks." },
      { name: "Pancake Bunny", amount: "$45M", date: "2021-05-19", detail: "Flash loan price manipulation in AMM pools inflated reward calculations." },
    ],
    mitigation: [
      "Use TWAP oracles instead of spot prices for any financial calculation",
      "Add cooldown periods between deposit and governance actions",
      "Check for flash loan indicators: same-block borrow + repay",
      "Ensure invariants hold even with extreme token amounts",
    ],
  },
  oracle: {
    type: "Oracle Manipulation",
    description: "Attacker manipulates price feeds — either by exploiting spot prices or compromising oracle infrastructure — to profit from incorrect valuations.",
    realExamples: [
      { name: "Mango Markets", amount: "$114M", date: "2022-10-11", detail: "Manipulated MNGO token price on thin DEX liquidity, used inflated collateral to borrow all protocol assets." },
      { name: "Cream Finance v1", amount: "$37.5M", date: "2021-10-27", detail: "Manipulated price of yUSD through composable DeFi positions." },
    ],
    mitigation: [
      "Never use spot AMM prices for collateral valuation",
      "Use Chainlink or other decentralized oracle networks with TWAP",
      "Implement price deviation checks (reject >X% change per block)",
      "Use multiple oracle sources and take the median",
    ],
  },
  bridge: {
    type: "Bridge Exploit",
    description: "Cross-chain bridges are high-value targets. Exploits typically involve signature verification bypass, validator compromise, or relay message forgery.",
    realExamples: [
      { name: "Ronin Bridge", amount: "$625M", date: "2022-03-23", detail: "5 of 9 validator keys compromised (4 from Sky Mavis + 1 from Axie DAO)." },
      { name: "Wormhole", amount: "$326M", date: "2022-02-02", detail: "Signature verification bypass: attacker forged guardian signatures to mint 120K wETH." },
      { name: "Nomad Bridge", amount: "$190M", date: "2022-08-01", detail: "Initialization bug set trusted root to 0x00, allowing anyone to prove arbitrary messages." },
    ],
    mitigation: [
      "Require supermajority (>2/3) of validators for message verification",
      "Implement fraud proofs and challenge periods for large transfers",
      "Rotate validator keys regularly and use HSMs",
      "Rate-limit bridge transfers and implement circuit breakers",
    ],
  },
  "access control": {
    type: "Access Control Vulnerability",
    description: "Missing or incorrect permission checks allow unauthorized users to call privileged functions, potentially draining funds or modifying critical state.",
    realExamples: [
      { name: "Poly Network", amount: "$611M", date: "2021-08-10", detail: "Cross-chain relay allowed attacker to overwrite contract keeper address, gaining control of all funds." },
      { name: "Wintermute", amount: "$160M", date: "2022-09-20", detail: "Profanity-generated vanity address had weak private key, allowing attacker to drain DeFi vault." },
    ],
    mitigation: [
      "Use OpenZeppelin AccessControl or Ownable for all admin functions",
      "Implement multi-sig for high-value operations",
      "Never use tx.origin for authentication (use msg.sender)",
      "Audit ALL external/public functions for missing access checks",
    ],
  },
};

export const explainVulnAction: Action = {
  name: "EXPLAIN_VULNERABILITY",
  description: "Explains DeFi vulnerability types with real exploit examples, code patterns, and mitigation strategies.",
  similes: ["EXPLAIN_VULN", "VULNERABILITY", "ATTACK_VECTOR", "EXPLOIT_TYPE", "SECURITY_BRIEF"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content?.text || "").toLowerCase();
    return text.includes("vulnerab") || text.includes("exploit") || text.includes("attack") ||
           text.includes("reentrancy") || text.includes("flash loan") || text.includes("oracle") ||
           text.includes("bridge") || text.includes("access control") || text.includes("explain");
  },
  handler: async (_runtime: IAgentRuntime, message: Memory, _state?: State, _options?: HandlerOptions, callback?: HandlerCallback) => {
    const text = (message.content?.text || "").toLowerCase();

    // Match vulnerability type
    let matched: VulnInfo | null = null;
    for (const [key, info] of Object.entries(VULN_DATABASE)) {
      if (text.includes(key)) { matched = info; break; }
    }

    if (!matched) {
      // List available types
      const types = Object.values(VULN_DATABASE).map(v => `- **${v.type}**`).join("\n");
      if (callback) await callback({
        text: `## Available Vulnerability Explainers\n\n${types}\n\nSpecify a vulnerability type. Example: "Explain reentrancy attacks"`
      });
      return;
    }

    const report = [
      `## ${matched.type}`,
      ``,
      matched.description,
      ``,
      `### Real-World Exploits`,
      matched.realExamples.map((e, i) =>
        `${i+1}. **${e.name}** (${e.date}) — ${e.amount}\n   ${e.detail}`
      ).join("\n"),
      ``,
      `### Mitigation Strategies`,
      matched.mitigation.map((m, i) => `${i+1}. ${m}`).join("\n"),
      ``,
      `> Use ASSESS_PROTOCOL_RISK on a specific protocol to check for these patterns.`,
    ].join("\n");

    if (callback) await callback({ text: report });
  },
  examples: [[
    { name: "user", content: { text: "Explain flash loan attacks" } },
    { name: "Axiom", content: { text: "Flash loan attacks exploit zero-collateral borrowing..." } },
  ]],
};
