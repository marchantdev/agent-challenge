/**
 * Axiom Action Tests
 * Basic validation that each action triggers on expected keywords
 * and returns structured responses.
 */

import { describe, it, expect } from "vitest";
import { assessRiskAction } from "../actions/assessRisk.ts";
import { explainVulnAction } from "../actions/explainVuln.ts";
import { scanTvlAction } from "../actions/scanTvl.ts";
import { inspectContractAction } from "../actions/inspectContract.ts";
import { exploitHistoryAction } from "../actions/exploitHistory.ts";
import { scanBountiesAction } from "../actions/scanBounties.ts";
import { auditReconAction } from "../actions/auditRecon.ts";
import { nosanaStatusAction } from "../actions/nosanaStatus.ts";
import { analyzeWalletAction } from "../actions/analyzeWallet.ts";
import { monitorProtocolAction } from "../actions/monitorProtocol.ts";
import { compareProtocolsAction } from "../actions/compareProtocols.ts";
import { generateAuditReportAction } from "../actions/generateAuditReport.ts";

// Mock runtime and memory
const mockRuntime = {} as any;
function makeMemory(text: string) {
  return { content: { text } } as any;
}

describe("Action Validation (keyword triggers)", () => {
  it("ASSESS_PROTOCOL_RISK triggers on 'risk' keyword", async () => {
    expect(await assessRiskAction.validate!(mockRuntime, makeMemory("Assess the risk of Aave"))).toBe(true);
  });

  it("ASSESS_PROTOCOL_RISK does not trigger on unrelated text", async () => {
    expect(await assessRiskAction.validate!(mockRuntime, makeMemory("hello world"))).toBe(false);
  });

  it("EXPLAIN_VULNERABILITY triggers on 'reentrancy'", async () => {
    expect(await explainVulnAction.validate!(mockRuntime, makeMemory("Explain reentrancy attacks"))).toBe(true);
  });

  it("EXPLAIN_VULNERABILITY triggers on 'flash loan'", async () => {
    expect(await explainVulnAction.validate!(mockRuntime, makeMemory("How do flash loan attacks work?"))).toBe(true);
  });

  it("SCAN_DEFI_TVL triggers on 'tvl' keyword", async () => {
    expect(await scanTvlAction.validate!(mockRuntime, makeMemory("Show me top TVL protocols"))).toBe(true);
  });

  it("SCAN_DEFI_TVL triggers on 'top protocol'", async () => {
    expect(await scanTvlAction.validate!(mockRuntime, makeMemory("What are the top protocols?"))).toBe(true);
  });

  it("INSPECT_CONTRACT triggers on Ethereum address", async () => {
    expect(await inspectContractAction.validate!(mockRuntime, makeMemory("Inspect 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"))).toBe(true);
  });

  it("EXPLOIT_HISTORY triggers on 'hack' keyword", async () => {
    expect(await exploitHistoryAction.validate!(mockRuntime, makeMemory("Show me the biggest hacks"))).toBe(true);
  });

  it("EXPLOIT_HISTORY triggers on 'exploit' keyword", async () => {
    expect(await exploitHistoryAction.validate!(mockRuntime, makeMemory("What are recent DeFi exploits?"))).toBe(true);
  });

  it("SCAN_BOUNTIES triggers on 'bounty' keyword", async () => {
    expect(await scanBountiesAction.validate!(mockRuntime, makeMemory("Find bounty programs"))).toBe(true);
  });

  it("AUDIT_RECON triggers on 'github' keyword", async () => {
    expect(await auditReconAction.validate!(mockRuntime, makeMemory("Check github.com/aave/aave-v3-core"))).toBe(true);
  });

  it("NOSANA_STATUS triggers on 'nosana' keyword", async () => {
    expect(await nosanaStatusAction.validate!(mockRuntime, makeMemory("Tell me about Nosana"))).toBe(true);
  });

  it("NOSANA_STATUS triggers on 'where do you run'", async () => {
    expect(await nosanaStatusAction.validate!(mockRuntime, makeMemory("Where do you run?"))).toBe(true);
  });

  it("NOSANA_STATUS triggers on 'infrastructure'", async () => {
    expect(await nosanaStatusAction.validate!(mockRuntime, makeMemory("What infrastructure do you use?"))).toBe(true);
  });

  it("ANALYZE_WALLET triggers on 'analyze wallet' with ETH address", async () => {
    expect(await analyzeWalletAction.validate!(mockRuntime, makeMemory("Analyze wallet 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"))).toBe(true);
  });

  it("ANALYZE_WALLET triggers on 'wallet risk'", async () => {
    expect(await analyzeWalletAction.validate!(mockRuntime, makeMemory("wallet risk for this address 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"))).toBe(true);
  });

  it("ANALYZE_WALLET triggers on 'check portfolio'", async () => {
    expect(await analyzeWalletAction.validate!(mockRuntime, makeMemory("check portfolio 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"))).toBe(true);
  });

  it("ANALYZE_WALLET triggers on bare ETH address", async () => {
    expect(await analyzeWalletAction.validate!(mockRuntime, makeMemory("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"))).toBe(true);
  });

  it("ANALYZE_WALLET does not trigger on unrelated text", async () => {
    expect(await analyzeWalletAction.validate!(mockRuntime, makeMemory("What is the weather today?"))).toBe(false);
  });

  it("MONITOR_PROTOCOL triggers on 'monitor Aave'", async () => {
    expect(await monitorProtocolAction.validate!(mockRuntime, makeMemory("monitor Aave"))).toBe(true);
  });

  it("MONITOR_PROTOCOL triggers on 'watch Compound'", async () => {
    expect(await monitorProtocolAction.validate!(mockRuntime, makeMemory("watch Compound"))).toBe(true);
  });

  it("MONITOR_PROTOCOL triggers on 'check watchlist'", async () => {
    expect(await monitorProtocolAction.validate!(mockRuntime, makeMemory("check watchlist"))).toBe(true);
  });

  it("MONITOR_PROTOCOL triggers on 'monitored protocols'", async () => {
    expect(await monitorProtocolAction.validate!(mockRuntime, makeMemory("show me monitored protocols"))).toBe(true);
  });

  it("MONITOR_PROTOCOL does not trigger on unrelated text", async () => {
    expect(await monitorProtocolAction.validate!(mockRuntime, makeMemory("hello world"))).toBe(false);
  });

  it("COMPARE_PROTOCOLS triggers on 'compare X vs Y'", async () => {
    expect(await compareProtocolsAction.validate!(mockRuntime, makeMemory("Compare Aave vs Compound"))).toBe(true);
  });

  it("COMPARE_PROTOCOLS triggers on 'X versus Y'", async () => {
    expect(await compareProtocolsAction.validate!(mockRuntime, makeMemory("Uniswap versus Curve comparison"))).toBe(true);
  });

  it("COMPARE_PROTOCOLS does not trigger on single protocol name", async () => {
    expect(await compareProtocolsAction.validate!(mockRuntime, makeMemory("assess Aave"))).toBe(false);
  });

  it("GENERATE_AUDIT_REPORT triggers on 'audit report for X'", async () => {
    expect(await generateAuditReportAction.validate!(mockRuntime, makeMemory("audit report for Aave"))).toBe(true);
  });

  it("GENERATE_AUDIT_REPORT triggers on 'full audit of X'", async () => {
    expect(await generateAuditReportAction.validate!(mockRuntime, makeMemory("full audit of Compound"))).toBe(true);
  });

  it("GENERATE_AUDIT_REPORT triggers on 'security report'", async () => {
    expect(await generateAuditReportAction.validate!(mockRuntime, makeMemory("security report for Uniswap"))).toBe(true);
  });

  it("GENERATE_AUDIT_REPORT does not trigger on unrelated text", async () => {
    expect(await generateAuditReportAction.validate!(mockRuntime, makeMemory("what is TVL?"))).toBe(false);
  });
});

describe("Action metadata", () => {
  const actions = [
    assessRiskAction,
    explainVulnAction,
    scanTvlAction,
    inspectContractAction,
    exploitHistoryAction,
    scanBountiesAction,
    auditReconAction,
    nosanaStatusAction,
    analyzeWalletAction,
    monitorProtocolAction,
    compareProtocolsAction,
    generateAuditReportAction,
  ];

  it("all 12 actions are defined", () => {
    expect(actions).toHaveLength(12);
  });

  it("all actions have name, description, and handler", () => {
    for (const action of actions) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(typeof action.handler).toBe("function");
    }
  });

  it("all actions have validate function", () => {
    for (const action of actions) {
      expect(typeof action.validate).toBe("function");
    }
  });

  it("all actions have examples", () => {
    for (const action of actions) {
      expect(action.examples).toBeDefined();
      expect(action.examples!.length).toBeGreaterThan(0);
    }
  });

  it("all actions have similes for alternative trigger phrases", () => {
    for (const action of actions) {
      expect(action.similes).toBeDefined();
      expect(action.similes!.length).toBeGreaterThan(0);
    }
  });
});

describe("Formatting utilities", () => {
  it("formatUsd formats large numbers correctly", async () => {
    const { formatUsd } = await import("../utils/api.ts");
    expect(formatUsd(1_500_000_000)).toBe("$1.50B");
    expect(formatUsd(250_000_000)).toBe("$250.0M");
    expect(formatUsd(50_000)).toBe("$50K");
    expect(formatUsd(500)).toBe("$500");
  });

  it("extractEthAddress extracts valid addresses", async () => {
    const { extractEthAddress } = await import("../utils/addressDetect.ts");
    expect(extractEthAddress("Inspect 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D")).toBe("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
    expect(extractEthAddress("no address here")).toBeNull();
  });

  it("extractProtocolName extracts names from natural language", async () => {
    const { extractProtocolName } = await import("../utils/api.ts");
    expect(extractProtocolName("Assess the risk of Aave V3")).toBe("Aave V3");
    expect(extractProtocolName("Is Uniswap safe?")).toBe("Uniswap");
  });
});

// ─── Handler-level tests ─────────────────────────────────────────────────────
// These tests mock global fetch and verify that handlers return correctly
// structured markdown output with expected sections and data.

import { vi, beforeEach, afterEach } from "vitest";

const MOCK_PROTOCOLS = [
  {
    name: "Aave V3",
    slug: "aave-v3",
    tvl: 20_000_000_000,
    change_1d: 0.5,
    change_7d: 1.2,
    chains: ["Ethereum", "Polygon", "Arbitrum"],
    category: "Lending",
    listedAt: 1_600_000_000,
    audits: "3",
    address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  },
  {
    name: "Compound",
    slug: "compound",
    tvl: 3_000_000_000,
    change_1d: -1.1,
    change_7d: -2.5,
    chains: ["Ethereum"],
    category: "Lending",
    listedAt: 1_550_000_000,
    audits: "5",
    address: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B",
  },
];

const MOCK_HACKS: unknown[] = [];

function makeMockFetch() {
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/protocols")) {
      return { ok: true, json: async () => MOCK_PROTOCOLS } as Response;
    }
    if (u.includes("/hacks")) {
      return { ok: true, json: async () => MOCK_HACKS } as Response;
    }
    if (u.includes("etherscan")) {
      return {
        ok: true,
        json: async () => ({ status: "1", result: [{ SourceCode: "// src" }] }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
}

describe("Action handlers — mock fetch + markdown verification", () => {
  let savedFetch: typeof fetch;

  const mockRuntime = {
    useModel: vi.fn().mockResolvedValue(
      "AI analysis: Protocol shows moderate risk based on current metrics."
    ),
  } as any;

  beforeEach(() => {
    savedFetch = global.fetch;
    (global as any).fetch = makeMockFetch();
  });

  afterEach(() => {
    (global as any).fetch = savedFetch;
    vi.clearAllMocks();
  });

  it("ASSESS_PROTOCOL_RISK handler returns markdown with ## Risk Assessment header", async () => {
    const calls: { text: string }[] = [];
    const cb = async (r: { text: string }) => { calls.push(r); };

    await assessRiskAction.handler!(mockRuntime, makeMemory("risk Compound"), undefined, {}, cb);

    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/## Risk Assessment/);
  });

  it("ASSESS_PROTOCOL_RISK handler markdown contains Security Score /100", async () => {
    const calls: { text: string }[] = [];
    await assessRiskAction.handler!(
      mockRuntime, makeMemory("risk Compound"), undefined, {}, async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/Security Score.*\/100/);
  });

  it("ASSESS_PROTOCOL_RISK handler markdown includes component table rows", async () => {
    const calls: { text: string }[] = [];
    await assessRiskAction.handler!(
      mockRuntime, makeMemory("risk Compound"), undefined, {}, async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/TVL Stability/);
    expect(final).toMatch(/Protocol Maturity/);
    expect(final).toMatch(/Exploit History/);
  });

  it("ASSESS_PROTOCOL_RISK handler score is in 0-100 range", async () => {
    const calls: { text: string }[] = [];
    await assessRiskAction.handler!(
      mockRuntime, makeMemory("risk Compound"), undefined, {}, async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    const m = final.match(/(\d+)\/100/);
    expect(m).not.toBeNull();
    if (m) {
      expect(parseInt(m[1])).toBeGreaterThanOrEqual(0);
      expect(parseInt(m[1])).toBeLessThanOrEqual(100);
    }
  });

  it("ASSESS_PROTOCOL_RISK handler responds with not-found for unknown protocol", async () => {
    const calls: { text: string }[] = [];
    await assessRiskAction.handler!(
      mockRuntime,
      makeMemory("risk NonexistentProtocolXYZ999"),
      undefined,
      {},
      async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/could not find|not found/i);
  });

  it("COMPARE_PROTOCOLS handler returns markdown with Protocol Comparison header", async () => {
    const calls: { text: string }[] = [];
    await compareProtocolsAction.handler!(
      mockRuntime,
      makeMemory("Aave V3 vs Compound"),
      undefined,
      {},
      async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/Protocol Comparison/);
  });

  it("COMPARE_PROTOCOLS handler table contains both protocol names", async () => {
    const calls: { text: string }[] = [];
    await compareProtocolsAction.handler!(
      mockRuntime,
      makeMemory("Aave V3 vs Compound"),
      undefined,
      {},
      async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toContain("Aave");
    expect(final).toContain("Compound");
  });

  it("COMPARE_PROTOCOLS handler markdown includes Security Score row", async () => {
    const calls: { text: string }[] = [];
    await compareProtocolsAction.handler!(
      mockRuntime,
      makeMemory("Aave V3 vs Compound"),
      undefined,
      {},
      async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/Security Score/);
    expect(final).toMatch(/\/100/);
  });

  it("COMPARE_PROTOCOLS handler handles missing second protocol", async () => {
    const calls: { text: string }[] = [];
    await compareProtocolsAction.handler!(
      mockRuntime,
      makeMemory("Aave V3 vs NonexistentProtocol999"),
      undefined,
      {},
      async (r) => calls.push(r)
    );
    const final = calls[calls.length - 1]?.text ?? "";
    expect(final).toMatch(/could not find|not found/i);
  });
});

