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

Beyond the base ElizaOS chat functionality, Axiom includes **5 custom actions**:

### `ASSESS_PROTOCOL_RISK`
Triggered when you ask Axiom to audit or assess a protocol. Provides a structured 5-point framework:
1. Trust model (who can do what)
2. Invariant identification (what must always hold)
3. Economic attack surface (oracle manipulation, flash loans)
4. Composability risks (external call dangers)
5. Upgrade risk (proxy pattern vulnerabilities)

### `EXPLAIN_VULNERABILITY`
Deep explanations of smart contract vulnerability patterns with real exploit examples and code-level mitigations. Covers 7 vulnerability classes:
- **Reentrancy** (including cross-function, cross-contract, and read-only variants)
- **Flash loan attacks** (with real examples: Mango Markets, Beanstalk, Harvest)
- **Oracle manipulation** (AMM spot price, Chainlink staleness, sequencer downtime)
- **Access control failures** (missing modifiers, re-initialisation, two-step ownership)
- **Integer overflow/underflow** (unchecked blocks, unsafe casting, rounding direction)
- **MEV / sandwich attacks** (front-running, governance attacks, JIT liquidity)
- **Storage collision** (proxy patterns, UUPS vs Transparent, initialisation attacks)

### `SCAN_DEFI_TVL` *(NEW)*
Fetches live TVL rankings from DefiLlama API. Supports category filters: lending, DEX/AMM, yield, or all. Shows top 10 protocols with 24h change data.

### `INSPECT_CONTRACT` *(NEW)*
Inspects any Ethereum contract address — fetches balance, transaction count, and verified source code status via Etherscan. Triggered by any 0x address in the message.

### `EXPLOIT_HISTORY` *(NEW)*
Curated database of major DeFi hacks with attack vectors, amounts lost, and chain. Supports filtering by chain (Solana, BSC, Ethereum) or keyword. Covers 12+ major incidents from The DAO (2016) to Ronin Bridge (2022).

---

## Deployment

**Docker Image:** `ghcr.io/marchantdev/agent-challenge:latest`
**Live Deployment:** `https://4HXAjRna3oV9FCinnT1uTrRm74Qri8spbLT54dced3rz.node.k8s.prd.nos.ci`

**Nosana Job Definition:** See `nos_job_def/nosana_eliza_job_definition.json`

**Automated Build:** Every push to `main` triggers a GitHub Actions workflow that builds and pushes the Docker image to GHCR.

### Quick Deploy on Nosana

```bash
# 1. Get your Nosana builders credits at nosana.com/builders-credits

# 2. Deploy the agent
nosana job post \
  --file ./nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-3090-community \
  --timeout 60

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
