# Axiom — DeFi Intelligence Agent 🔍

**Personal AI security analyst for DeFi protocols, deployed on Nosana's decentralised compute network.**

> *"Every DeFi user deserves the same quality of analysis that institutional players get."*

---

## What Is Axiom?

Axiom is a persistent personal AI agent that specialises in:

- **Protocol risk assessment** — Systematic analysis of trust models, invariants, and attack surfaces
- **Smart contract security** — Structured explanations of vulnerability patterns (reentrancy, flash loans, oracle manipulation, access control)
- **DeFi yield research** — Risk-aware yield opportunity analysis across Ethereum, Solana, and L2s
- **On-chain investigation** — Methodology for tracing transactions and verifying protocol claims

Built with [ElizaOS v2](https://elizaos.com) and powered by the **Qwen3.5-27B** model provided by Nosana.

---

## Why Axiom on Nosana?

Running Axiom on Nosana's decentralised GPU network demonstrates something important: **AI sovereignty is already possible.** Your personal security analyst doesn't need to depend on AWS, Azure, or any centralised provider.

- **Decentralised** — No single point of failure
- **Permissionless** — No KYC, no gatekeeping  
- **Private** — Your research queries don't go to Big Tech
- **Sovereign** — You control the infrastructure

---

## Custom Plugin: Axiom DeFi Intelligence

Beyond the base ElizaOS chat functionality, Axiom includes two custom actions:

### `ASSESS_PROTOCOL_RISK`
Triggered when you ask Axiom to audit or assess a protocol. Provides a structured 5-point framework:
1. Trust model (who can do what)
2. Invariant identification (what must always hold)
3. Economic attack surface (oracle manipulation, flash loans)
4. Composability risks (external call dangers)
5. Upgrade risk (proxy pattern vulnerabilities)

### `EXPLAIN_VULNERABILITY`
Deep explanations of smart contract vulnerability patterns with real exploit examples and code-level mitigations. Currently covers reentrancy and flash loan attacks with detailed Solidity examples.

---

## Deployment

**Docker Image:** `ghcr.io/marchantdev/agent-challenge:latest`

**Nosana Job Definition:** See `nos_job_def/nosana_eliza_job_definition.json`

**Automated Build:** Every push to `main` triggers a GitHub Actions workflow that builds and pushes the Docker image to GHCR.

### Quick Deploy on Nosana

```bash
# 1. Get your Nosana builders credits at nosana.com/builders-credits

# 2. Deploy the agent
nosana job post \
  --file ./nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-3090 \
  --timeout 300

# 3. Get your deployment URL from the job output
```

---

## Example Interactions

**Reentrancy attack explanation:**
> "Reentrancy — The most famous DeFi vulnerability class. A contract calls an external address *before* updating its own state. The DAO hack ($60M, 2016) used this exact pattern..."

**Protocol risk assessment:**
> "**Axiom Risk Assessment Framework:** Start with the trust model — who are the privileged actors? What can they do unilaterally?..."

**Yield research:**
> "For ETH: Native staking ~3.5% base. Liquid staking (stETH/rETH) adds ~0.1-0.2% via MEV. EigenLayer restaking adds variable AVS rewards..."

---

## Built By

Built by [marchantdev](https://github.com/marchantdev) for the **Nosana x ElizaOS Builder Challenge 2026**.

*This submission embodies the OpenClaw philosophy: your AI, running on infrastructure you control.*
