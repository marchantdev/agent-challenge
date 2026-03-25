# Axiom — Decentralized DeFi Security Operations Center

> Security infrastructure that's as decentralized as the protocols it protects. Powered by Nosana + ElizaOS.

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                    Nosana GPU Node                     │
│                                                       │
│  ┌─────────────┐    ┌──────────────────────────────┐  │
│  │  React UI   │───▶│     ElizaOS Agent Runtime     │  │
│  │  (port 8080)│◀───│       (port 3000)             │  │
│  │             │    │                                │  │
│  │  Dashboard  │    │  ┌─────────────────────────┐  │  │
│  │  Chat       │    │  │   Axiom Security Plugin  │  │  │
│  │  Scanner    │    │  │   11 Custom Actions       │  │  │
│  │  Protocols  │    │  │                           │  │  │
│  │  Nosana     │    │  │   DefiLlama ←──── TVL     │  │  │
│  │             │    │  │   Etherscan ←──── Chain    │  │  │
│  │             │    │  │   GitHub    ←──── Repos    │  │  │
│  │             │    │  │   Immunefi  ←──── Bounties │  │  │
│  └─────────────┘    │  └─────────────────────────┘  │  │
│                     │                                │  │
│                     │  Model: Qwen3.5-27B-AWQ-4bit   │  │
│                     └──────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Features

### Custom React Dashboard (5 Views)

- **Dashboard** — Live stat cards, TVL bar chart, exploit timeline, attack vector distribution, TVL anomaly alerts
- **Chat** — Conversation with Axiom agent, markdown rendering, structured risk reports, suggestion chips
- **Scanner** — Paste any Ethereum address for instant analysis (verification, proxy detection, compiler version)
- **Protocols** — Searchable/sortable table of top 100 DeFi protocols with risk indicators and anomaly badges
- **Nosana Status** — Deployment health, inference metrics, network node count, GPU types, "Why Decentralized?" section

### 11 Dynamic Actions (Custom ElizaOS Plugin)

| Action | Data Source | Description |
|--------|-----------|-------------|
| `ASSESS_PROTOCOL_RISK` | DefiLlama API | Real-time 5-category risk assessment with live TVL, volatility, and chain data |
| `EXPLAIN_VULNERABILITY` | Curated DB + examples | Reentrancy, flash loans, oracle manipulation, bridge exploits, access control |
| `SCAN_DEFI_TVL` | DefiLlama API | Live TVL rankings with category/chain filters and anomaly detection |
| `INSPECT_CONTRACT` | Etherscan API | Balance, verification, proxy detection, compiler version, deployer info |
| `EXPLOIT_HISTORY` | DeFiLlama Hacks API (478+ records) | Live exploit database — 1h cache, filters by chain/category/technique/year |
| `SCAN_BOUNTIES` | Immunefi API | Live bug bounty program scanner with reward tiers |
| `AUDIT_RECON` | GitHub API | Recent commits, audit indicators, repo health for any GitHub repository |
| `ANALYZE_WALLET` | Etherscan + DefiLlama | ETH wallet risk report — token holdings, DeFi exposure, spending patterns |
| `NOSANA_STATUS` | Process + Nosana API | Live deployment health, memory usage, network stats, infrastructure awareness |
| `COMPARE_PROTOCOLS` | DefiLlama API | Side-by-side security comparison of two protocols with scored breakdown and AI analysis |
| `GENERATE_AUDIT_REPORT` | DefiLlama + Etherscan + Immunefi + rekt.news + AI | **Killer feature** — full audit report orchestrating all data sources into a scored security report with AI risk assessment and recommendations |

### Nosana Integration

- **Deployed on Nosana GPU nodes** (NVIDIA RTX 3090)
- **Health endpoints** — `/api/health` and `/api/metrics` serving real operational data
- **Network awareness** — Agent knows about Nosana node count, GPU types, and its own deployment status
- **CI/CD pipeline** — GitHub Actions builds Docker image on every push to `main`
- **Network-aware character** — Agent explains why decentralized compute matters for security tooling

### Health & Metrics Endpoints

```
GET /api/health
{
  "status": "healthy",
  "uptimeSeconds": 84321,
  "inferenceLatencyMs": 342,
  "actionsTriggered": 1847,
  "nosanaNode": "4HXAjRna...",
  "model": "Qwen3.5-27B-AWQ-4bit"
}

GET /api/metrics
{
  "requestsTotal": 2841,
  "requestsByAction": { "ASSESS_PROTOCOL_RISK": 423, ... },
  "avgResponseTimeMs": 1240,
  "errorRate": 0.02
}
```

---

## Quick Start

### Local Development

```bash
# Clone
git clone https://github.com/marchantdev/agent-challenge.git
cd agent-challenge

# Install dependencies
pnpm install
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run
pnpm dev
```

### Docker Build

```bash
docker build -t axiom .
docker run -p 3000:3000 -p 8080:8080 --env-file .env axiom
```

### Deploy to Nosana

```bash
# Get builders credits at nosana.com/builders-credits
nosana job post \
  --file ./nos_job_def/nosana_eliza_job_definition.json \
  --market nvidia-3090 \
  --timeout 300
```

---

## Project Structure

```
├── frontend/               # React dashboard (Vite + TypeScript + Tailwind)
│   └── src/
│       ├── components/     # Dashboard, Chat, Scanner, Protocols, NosanaStatus
│       ├── lib/            # API client, types
│       └── styles/         # Tailwind globals
├── src/                    # ElizaOS agent plugin
│   ├── actions/            # 10 custom actions (each in own file)
│   ├── types/              # Shared TypeScript interfaces
│   ├── utils/              # API helpers, formatting
│   ├── character.ts        # Axiom character definition
│   ├── plugin.ts           # Plugin registration
│   ├── server.ts           # Frontend server + proxy + health endpoints
│   └── index.ts            # Project entry point
├── characters/             # Character JSON
├── nos_job_def/            # Nosana job definition
├── .github/workflows/      # CI/CD pipeline
├── Dockerfile              # Multi-stage build (frontend + agent)
└── README.md
```

---

## Why Decentralized Security Infrastructure?

Security tooling running on centralized cloud has a single point of failure. If the provider is compromised, rate-limits your API, or censors your analysis — the tool stops working.

Axiom runs on Nosana's decentralized GPU network — a Solana-based compute marketplace of independent node operators. This provides:

- **Censorship resistance** — No single entity can shut down or restrict security analysis
- **Trust minimization** — No centralized infrastructure to compromise
- **Always available** — GPU compute sourced from a marketplace; if one node goes down, jobs migrate

> The same trustless ethos as the DeFi protocols it protects.

---

## Deployment

- **Docker Image:** `ghcr.io/marchantdev/agent-challenge:latest`
- **CI/CD:** GitHub Actions auto-builds on push to `main`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Framework | ElizaOS v1 |
| LLM | Qwen3.5-27B-AWQ-4bit |
| Frontend | React 19 + Vite 6 + TypeScript + Tailwind CSS |
| Compute | Nosana decentralized GPU (RTX 3090) |
| APIs | DefiLlama, DeFiLlama Hacks, Etherscan, GitHub, Immunefi, Nosana |
| Container | Docker (multi-stage build) |
| CI/CD | GitHub Actions |

---

Built by [marchantdev](https://github.com/marchantdev) for the **Nosana x ElizaOS Builder Challenge 2026**.
