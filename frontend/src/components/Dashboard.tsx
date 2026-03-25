import { useEffect, useState } from "react";
import type { View, Protocol, Exploit } from "../lib/types";
import { fetchProtocols, getExploits, getTotalExploitLoss, fetchHealth } from "../lib/api";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function TvlBar({ protocols }: { protocols: Protocol[] }) {
  const max = protocols[0]?.tvl || 1;
  return (
    <div className="card col-span-2">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Top Protocols by TVL</h3>
      <div className="space-y-2">
        {protocols.slice(0, 10).map((p) => (
          <div key={p.slug} className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-28 truncate">{p.name}</span>
            <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-600/70 rounded"
                style={{ width: `${(p.tvl / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-300 w-16 text-right font-mono">
              {formatUsd(p.tvl)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExploitTimeline({ exploits }: { exploits: Exploit[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Recent Major Exploits</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {exploits.slice(0, 10).map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-zinc-600 font-mono w-20 shrink-0">{e.date}</span>
            <div className="flex-1">
              <span className="text-zinc-200 font-medium">{e.name}</span>
              <span className="text-red-400 ml-2">{formatUsd(e.amount)}</span>
              <p className="text-zinc-500">{e.technique}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<string>("checking...");

  useEffect(() => {
    fetchProtocols()
      .then(setProtocols)
      .catch(() => setProtocols([]))
      .finally(() => setLoading(false));
    fetchHealth().then((h) => setHealthStatus(h.status));
  }, []);

  const exploits = getExploits();
  const totalTvl = protocols.reduce((s, p) => s + p.tvl, 0);
  const totalLoss = getTotalExploitLoss();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Axiom Dashboard</h1>
        <p className="text-sm text-zinc-500">DeFi Security Operations Center — powered by Nosana</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Protocols Tracked" value={loading ? "..." : String(protocols.length)} sub="via DefiLlama" />
        <StatCard label="Total TVL" value={loading ? "..." : formatUsd(totalTvl)} sub="top 100 protocols" />
        <StatCard label="Total Exploit Losses" value={formatUsd(totalLoss)} sub={`${exploits.length} tracked incidents`} />
        <StatCard
          label="Nosana Status"
          value={healthStatus === "healthy" ? "Online" : healthStatus === "degraded" ? "Degraded" : healthStatus}
          sub="Decentralized GPU"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        <TvlBar protocols={protocols} />
        <ExploitTimeline exploits={exploits} />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Quick Actions</h3>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => onNavigate("scanner")} className="btn-primary">
            Scan Contract
          </button>
          <button onClick={() => onNavigate("chat")} className="btn-secondary">
            Ask Axiom
          </button>
          <button onClick={() => onNavigate("protocols")} className="btn-secondary">
            Browse Protocols
          </button>
          <button onClick={() => onNavigate("nosana")} className="btn-secondary">
            Nosana Health
          </button>
        </div>
      </div>
    </div>
  );
}
