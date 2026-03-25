import { useState } from "react";
import { inspectContract } from "../lib/api";

interface ScanHistory {
  address: string;
  timestamp: number;
  result: any;
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

function ResultCard({ result }: { result: any }) {
  if (result.error) {
    return (
      <div className="card border-red-900">
        <p className="text-red-400 text-sm">{result.error}</p>
      </div>
    );
  }

  const riskLevel = !result.verified ? "High" : result.isProxy ? "Medium" : "Low";

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{result.contractName || "Contract"}</h3>
        <RiskBadge level={riskLevel} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-zinc-500 text-xs">Address</p>
          <p className="font-mono text-xs truncate">{result.address}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Chain</p>
          <p>{result.chain}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Balance</p>
          <p className="font-mono">{result.balance}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Verified Source</p>
          <p className={result.verified ? "text-emerald-400" : "text-red-400"}>
            {result.verified ? "Yes" : "No"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Proxy Contract</p>
          <p className={result.isProxy ? "text-amber-400" : "text-zinc-300"}>
            {result.isProxy ? "Yes (upgradeable)" : "No"}
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <h4 className="text-xs text-zinc-500 uppercase mb-2">Risk Assessment</h4>
        <ul className="space-y-1 text-sm">
          {!result.verified && (
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-red-400">Unverified source code — cannot audit</span>
            </li>
          )}
          {result.isProxy && (
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-amber-400">Proxy contract — admin can upgrade logic</span>
            </li>
          )}
          {result.verified && !result.isProxy && (
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-400">Verified, non-upgradeable — good baseline</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default function Scanner() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ScanHistory[]>([]);

  const scan = async () => {
    const addr = address.trim();
    if (!addr || loading) return;
    setLoading(true);
    try {
      const result = await inspectContract(addr);
      setHistory((h) => [{ address: addr, timestamp: Date.now(), result }, ...h]);
    } catch (e) {
      setHistory((h) => [
        { address: addr, timestamp: Date.now(), result: { error: String(e) } },
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
        <p className="text-sm text-zinc-500">Paste an Ethereum contract address for instant analysis</p>
      </div>

      {/* Input */}
      <div className="card">
        <div className="flex gap-2">
          <input
            className="input flex-1 font-mono text-sm"
            placeholder="0x... (Ethereum contract address)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            disabled={loading}
          />
          <button onClick={scan} disabled={loading || !address.trim()} className="btn-primary disabled:opacity-50">
            {loading ? "Scanning..." : "Scan"}
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          Examples: Uniswap V3 Router (0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45),
          USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
        </p>
      </div>

      {/* Results */}
      {history.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-400">Scan Results</h3>
          {history.map((h, i) => (
            <ResultCard key={i} result={h.result} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3 text-zinc-700">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm">Paste a contract address above to start scanning</p>
          <p className="text-zinc-600 text-xs mt-1">Fetches on-chain data, checks verification status, and detects proxy patterns</p>
        </div>
      )}
    </div>
  );
}
