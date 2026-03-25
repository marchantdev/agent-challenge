import { useState } from "react";
import { inspectContract } from "../lib/api";
import type { ContractInfo } from "../lib/types";

interface ScanHistory {
  address: string;
  timestamp: number;
  result: ContractInfo | { error: string };
}

function RiskBadge({ level }: { level: string }) {
  const cls =
    level === "Critical" ? "badge-critical" :
    level === "High" ? "badge-high" :
    level === "Medium" ? "badge-medium" :
    level === "Low" ? "badge-low" :
    "badge-info";
  return <span className={cls}>{level}</span>;
}

function getRiskLevel(result: ContractInfo): string {
  if (!result.verified) return "High";
  if (result.isProxy) return "Medium";
  return "Low";
}

function getRiskItems(result: ContractInfo): { color: string; text: string }[] {
  const items: { color: string; text: string }[] = [];
  if (!result.verified) {
    items.push({ color: "bg-red-500", text: "Unverified source code \u2014 cannot audit contract logic" });
  }
  if (result.isProxy) {
    items.push({ color: "bg-amber-500", text: "Proxy contract \u2014 admin can upgrade implementation logic" });
    if (result.implementation) {
      items.push({ color: "bg-blue-500", text: `Implementation: ${result.implementation}` });
    }
  }
  if (result.verified && !result.isProxy) {
    items.push({ color: "bg-emerald-500", text: "Verified, non-upgradeable \u2014 logic is immutable" });
  }
  if (result.verified) {
    items.push({ color: "bg-emerald-500", text: "Source code verified on Etherscan" });
  }
  if (result.compilerVersion) {
    const ver = result.compilerVersion;
    if (ver.includes("0.8")) {
      items.push({ color: "bg-emerald-500", text: `Solidity ${ver.split("+")[0].replace("v", "")} \u2014 built-in overflow protection` });
    } else if (ver.includes("0.7") || ver.includes("0.6")) {
      items.push({ color: "bg-amber-500", text: `Solidity ${ver.split("+")[0].replace("v", "")} \u2014 no built-in overflow checks` });
    }
  }
  return items;
}

function ResultCard({ result }: { result: ContractInfo | { error: string } }) {
  if ("error" in result) {
    return (
      <div className="card border-red-900/50">
        <p className="text-red-400 text-sm">{result.error}</p>
      </div>
    );
  }

  const riskLevel = getRiskLevel(result);
  const riskItems = getRiskItems(result);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{result.contractName || "Contract"}</h3>
          <span className="text-xs text-zinc-500">{result.chain}</span>
        </div>
        <RiskBadge level={riskLevel} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Address</p>
          <p className="font-mono text-xs mt-1 text-zinc-300 break-all">{result.address}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Balance</p>
          <p className="font-mono mt-1">{result.balance}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Verified Source</p>
          <p className={`mt-1 font-medium ${result.verified ? "text-emerald-400" : "text-red-400"}`}>
            {result.verified ? "Yes" : "No"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Proxy Contract</p>
          <p className={`mt-1 font-medium ${result.isProxy ? "text-amber-400" : "text-zinc-300"}`}>
            {result.isProxy ? "Yes (upgradeable)" : "No"}
          </p>
        </div>
        {result.compilerVersion && (
          <div className="col-span-2">
            <p className="text-zinc-500 text-xs uppercase tracking-wider">Compiler</p>
            <p className="font-mono text-xs mt-1 text-zinc-300">{result.compilerVersion}</p>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Risk Assessment</h4>
        <ul className="space-y-1.5">
          {riskItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${item.color} mt-1.5 shrink-0`} />
              <span className="text-zinc-300">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const EXAMPLES = [
  { label: "Uniswap V3 Router", address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" },
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { label: "Aave V3 Pool", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" },
  { label: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
];

export default function Scanner() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ScanHistory[]>([]);

  const scan = async (addr?: string) => {
    const target = (addr || address).trim();
    if (!target || loading) return;
    setLoading(true);
    setAddress(target);
    try {
      const result = await inspectContract(target);
      setHistory((h) => [{ address: target, timestamp: Date.now(), result }, ...h]);
    } catch (e: any) {
      setHistory((h) => [
        { address: target, timestamp: Date.now(), result: { error: e.message || String(e) } },
        ...h,
      ]);
    }
    setLoading(false);
    setAddress("");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contract Scanner</h1>
        <p className="text-sm text-zinc-500">Analyze any Ethereum smart contract for security signals</p>
      </div>

      {/* Input */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <input
            className="input flex-1 font-mono text-sm"
            placeholder="0x... (Ethereum contract address)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            disabled={loading}
          />
          <button onClick={() => scan()} disabled={loading || !address.trim()} className="btn-primary disabled:opacity-50">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning
              </span>
            ) : "Scan"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.address}
              onClick={() => scan(ex.address)}
              disabled={loading}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors font-mono disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {history.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-400">
              Scan Results ({history.length})
            </h3>
            {history.length > 1 && (
              <button
                onClick={() => setHistory([])}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear history
              </button>
            )}
          </div>
          {history.map((h, i) => (
            <ResultCard key={`${h.address}-${h.timestamp}`} result={h.result} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && !loading && (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 mx-auto text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-zinc-500 text-sm font-medium">Paste a contract address to start scanning</p>
          <p className="text-zinc-600 text-xs mt-1.5">
            Fetches on-chain data from Etherscan &mdash; verification status, proxy detection, compiler version, and balance
          </p>
        </div>
      )}
    </div>
  );
}
