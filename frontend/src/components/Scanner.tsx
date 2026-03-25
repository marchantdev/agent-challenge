import React, { useState } from "react";
import { sendMessage } from "../lib/api";

interface ScanResult {
  address: string;
  timestamp: number;
  text?: string;
  error?: string;
}

// Inline markdown renderer (same style as Chat component)
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs font-mono text-emerald-300">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function formatAgentResponse(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  let inCodeBlock = false;
  let codeLines: string[] = [];

  lines.forEach((line, idx) => {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        parts.push(
          <pre key={`code-${idx}`} className="bg-zinc-900 border border-zinc-700 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }
    if (line.startsWith("### ")) {
      parts.push(<h4 key={idx} className="font-semibold text-zinc-200 mt-3 mb-1 text-sm">{line.slice(4)}</h4>);
      return;
    }
    if (line.startsWith("## ")) {
      parts.push(<h3 key={idx} className="font-bold text-zinc-100 mt-3 mb-1">{line.slice(3)}</h3>);
      return;
    }
    if (line.match(/^[-*]\s/)) {
      parts.push(
        <div key={idx} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      return;
    }
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1] || "";
      parts.push(
        <div key={idx} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-emerald-400 font-mono text-xs mt-0.5 w-4 shrink-0">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
      return;
    }
    if (line.trim() === "") { parts.push(<div key={idx} className="h-2" />); return; }
    parts.push(<p key={idx} className="my-0.5">{renderInline(line)}</p>);
  });

  if (inCodeBlock && codeLines.length > 0) {
    parts.push(
      <pre key="code-end" className="bg-zinc-900 border border-zinc-700 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono">
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
  }

  return <div className="text-sm text-zinc-200 leading-relaxed">{parts}</div>;
}

function ResultCard({ result }: { result: ScanResult }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">A</span>
          <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">AXIOM</span>
          <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px] sm:max-w-xs">{result.address}</span>
        </div>
        <span className="text-[10px] text-zinc-600">{new Date(result.timestamp).toLocaleTimeString()}</span>
      </div>
      {result.error ? (
        <p className="text-red-400 text-sm">{result.error}</p>
      ) : (
        formatAgentResponse(result.text || "")
      )}
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
        <p className="text-sm text-zinc-500">Analyze any smart contract for security signals — Ethereum and Solana supported</p>
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
