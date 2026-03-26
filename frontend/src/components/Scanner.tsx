import React, { useState } from "react";
import { sendMessage } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { ChainBadge, detectChain } from "./ChainBadge";
import SecurityGauge, { parseSecurityScore } from "./SecurityGauge";

interface ScanResult {
  address: string;
  timestamp: number;
  text?: string;
  error?: string;
}

function ResultCard({ result }: { result: ScanResult }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">A</span>
          <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">AXIOM</span>
          {detectChain(result.address) !== "unknown" && (
            <ChainBadge chain={detectChain(result.address)} size="xs" />
          )}
          <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px] sm:max-w-xs">{result.address}</span>
        </div>
        <span className="text-[10px] text-zinc-600">{new Date(result.timestamp).toLocaleTimeString()}</span>
      </div>
      {result.error ? (
        <p className="text-red-400 text-sm">{result.error}</p>
      ) : (
        <>
          {renderMarkdown(result.text || "")}
          {(() => {
            const parsed = parseSecurityScore(result.text || "");
            if (!parsed) return null;
            return (
              <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-center">
                <SecurityGauge
                  score={parsed.score}
                  components={parsed.components.length > 0 ? parsed.components : undefined}
                  size={140}
                />
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

const EXAMPLES = [
  { label: "Uniswap V3 Router", address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" },
  { label: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { label: "Aave V3 Pool", address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" },
  { label: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { label: "NOS Token (Solana)", address: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7" },
  { label: "SPL Token Program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
];

export default function Scanner() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);

  const scan = async (addr?: string) => {
    const target = (addr || address).trim();
    if (!target || loading) return;
    setLoading(true);
    setAddress(target);
    try {
      const text = await sendMessage("default", `Inspect contract ${target}`);
      setResults((r) => [{ address: target, timestamp: Date.now(), text }, ...r]);
    } catch (e: any) {
      setResults((r) => [{ address: target, timestamp: Date.now(), error: e.message || String(e) }, ...r]);
    }
    setLoading(false);
    setAddress("");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contract Scanner</h1>
        <p className="text-sm text-zinc-500">Analyze any smart contract for security signals</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Supports:</span>
          <ChainBadge chain="ethereum" size="xs" />
          <span className="text-zinc-700 text-[10px]">+</span>
          <ChainBadge chain="solana" size="xs" />
        </div>
      </div>

      {/* Input */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <input
            className="input flex-1 font-mono text-sm"
            placeholder="0x... or Solana program address"
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
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Ethereum examples</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {EXAMPLES.slice(0, 4).map((ex) => (
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
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Solana examples</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.slice(4).map((ex) => (
              <button
                key={ex.address}
                onClick={() => scan(ex.address)}
                disabled={loading}
                className="text-xs bg-zinc-800 border border-emerald-900/40 rounded px-2 py-1 text-zinc-500 hover:text-emerald-300 hover:border-emerald-700/50 transition-colors font-mono disabled:opacity-50"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-400">
              Scan Results ({results.length})
            </h3>
            {results.length > 1 && (
              <button
                onClick={() => setResults([])}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear history
              </button>
            )}
          </div>
          {results.map((r) => (
            <ResultCard key={`${r.address}-${r.timestamp}`} result={r} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !loading && (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 mx-auto text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-zinc-500 text-sm font-medium">Paste a contract address to start scanning</p>
          <p className="text-zinc-600 text-xs mt-1.5">
            Powered by Axiom agent &mdash; on-chain analysis via Etherscan V2 and Solana RPC
          </p>
        </div>
      )}
    </div>
  );
}
