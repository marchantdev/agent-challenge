import { useEffect, useState, useRef } from "react";
import type { View, Protocol, Exploit } from "../lib/types";
import { fetchProtocols, getExploits, getTotalExploitLoss, fetchHealth, detectAnomalies, formatUsd, getExploitsByTechnique, fetchExploitsLive } from "../lib/api";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card group hover:border-zinc-700 transition-colors">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 font-mono ${accent || "text-zinc-100"}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function TvlBar({ protocols }: { protocols: Protocol[] }) {
  const top = protocols.slice(0, 10);
  const max = top[0]?.tvl || 1;
  return (
    <div className="card col-span-2">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Top Protocols by TVL</h3>
      <div className="space-y-2">
        {top.map((p, i) => (
          <div key={p.slug} className="flex items-center gap-3 group">
            <span className="text-xs text-zinc-600 w-5 text-right font-mono">{i + 1}</span>
            <span className="text-xs text-zinc-400 w-28 truncate">{p.name}</span>
            <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-600/70 to-emerald-500/50 rounded transition-all duration-700"
                style={{ width: `${(p.tvl / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-300 w-16 text-right font-mono">{formatUsd(p.tvl)}</span>
            {p.change_1d !== null && (
              <span className={`text-xs w-14 text-right font-mono ${p.change_1d > 0 ? "text-emerald-400" : p.change_1d < -5 ? "text-red-400" : "text-zinc-500"}`}>
                {p.change_1d > 0 ? "+" : ""}{p.change_1d.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExploitTimeline({ exploits }: { exploits: Exploit[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Major Exploits</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {exploits.slice(0, 12).map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-xs group hover:bg-zinc-800/50 rounded p-1 -m-1 transition-colors">
            <span className="text-zinc-600 font-mono w-20 shrink-0">{e.date}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-zinc-200 font-medium truncate">{e.name}</span>
                <span className="text-red-400 font-mono shrink-0">{formatUsd(e.amount)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="badge-info text-[9px]">{e.chain}</span>
                <span className="text-zinc-500 truncate">{e.technique}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttackVectors() {
  const techniques = getExploitsByTechnique();
  const sorted = Object.entries(techniques).sort(([, a], [, b]) => b - a).slice(0, 6);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="card">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Attack Vector Distribution</h3>
      <div className="space-y-2">
        {sorted.map(([technique, amount]) => (
          <div key={technique} className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-36 truncate">{technique}</span>
            <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600/60 to-orange-500/40 rounded"
                style={{ width: `${(amount / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-300 w-14 text-right font-mono">{formatUsd(amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnomalyAlerts({ protocols, onNavigate }: { protocols: Protocol[]; onNavigate: (v: View) => void }) {
  const anomalies = detectAnomalies(protocols);
  if (anomalies.length === 0) return null;

  return (
    <div className="card border-amber-900/50 bg-amber-950/10">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h3 className="text-sm font-medium text-amber-400">TVL Anomaly Alerts</h3>
        <span className="badge-medium text-[9px]">{anomalies.length}</span>
      </div>
      <div className="space-y-1.5">
        {anomalies.slice(0, 5).map((p) => (
          <div key={p.slug} className="flex items-center justify-between text-xs py-1">
            <span className="text-zinc-300 font-medium">{p.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">{formatUsd(p.tvl)}</span>
              {p.change_1d !== null && (
                <span className={`font-mono ${p.change_1d < -10 ? "text-red-400" : "text-amber-400"}`}>
                  {p.change_1d.toFixed(1)}% (24h)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => onNavigate("protocols")}
        className="text-xs text-amber-400 hover:text-amber-300 mt-2 transition-colors"
      >
        View all protocols &rarr;
      </button>
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<string>("checking...");
  const [latency, setLatency] = useState<number>(0);
  const [exploits, setExploits] = useState<Exploit[]>(getExploits());
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = () => {
    fetchProtocols()
      .then(setProtocols)
      .catch(() => setProtocols([]))
      .finally(() => setLoading(false));
    fetchHealth().then((h) => {
      setHealthStatus(h.status);
      setLatency(h.inferenceLatencyMs);
    });
    fetchExploitsLive()
      .then(setExploits)
      .catch(() => {}); // fallback to static data already in state
    setLastRefresh(Date.now());
  };

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const totalTvl = protocols.reduce((s, p) => s + p.tvl, 0);
  const totalLoss = getTotalExploitLoss();
  const avgChange = protocols.length > 0
    ? protocols.reduce((s, p) => s + (p.change_1d || 0), 0) / protocols.length
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Security Operations Center</h1>
          <p className="text-sm text-zinc-500">
            Real-time DeFi intelligence &mdash; powered by Nosana decentralized compute
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live badge */}
          <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800/50 rounded-full px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-semibold text-emerald-400 tracking-wide">LIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${healthStatus === "healthy" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${healthStatus === "healthy" ? "bg-emerald-500" : "bg-red-500"}`} />
            </span>
            <span className="text-xs text-zinc-500">
              {healthStatus === "healthy" ? "Agent Online" : "Agent Offline"}
              {latency > 0 && ` (${latency}ms)`}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Protocols Monitored" value={loading ? "..." : String(protocols.length)} sub="via DefiLlama API" />
        <StatCard
          label="Total TVL"
          value={loading ? "..." : formatUsd(totalTvl)}
          sub={`Market ${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(1)}% (24h)`}
          accent={avgChange >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard label="Tracked Exploit Losses" value={formatUsd(totalLoss)} sub={`${exploits.length} incidents analyzed`} accent="text-red-400" />
        <StatCard
          label="Nosana Status"
          value={healthStatus === "healthy" ? "Online" : healthStatus}
          sub="Decentralized GPU inference"
          accent={healthStatus === "healthy" ? "text-emerald-400" : "text-amber-400"}
        />
      </div>

      {/* Analysis Pipeline Visualization */}
      <div className="card bg-zinc-900/50">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Analysis Pipeline</p>
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { label: "Data Sources", icon: "⬡", color: "bg-blue-950/60 border-blue-800/50 text-blue-300" },
            { label: "Constraint Analysis", icon: "⚙", color: "bg-violet-950/60 border-violet-800/50 text-violet-300" },
            { label: "AI Assessment", icon: "◈", color: "bg-amber-950/60 border-amber-800/50 text-amber-300" },
            { label: "Security Score", icon: "◎", color: "bg-emerald-950/60 border-emerald-800/50 text-emerald-300" },
            { label: "Alert", icon: "◉", color: "bg-red-950/60 border-red-800/50 text-red-300" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${step.color}`}>
                <span className="text-[11px]">{step.icon}</span>
                {step.label}
              </div>
              {i < arr.length - 1 && (
                <svg className="w-3 h-3 text-zinc-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Anomaly Alerts */}
      <AnomalyAlerts protocols={protocols} onNavigate={onNavigate} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TvlBar protocols={protocols} />
        <ExploitTimeline exploits={exploits} />
      </div>

      {/* Attack Vectors + Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AttackVectors />
        <div className="card flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Quick Actions</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Jump into any analysis workflow. Axiom can assess risks, scan contracts,
              and provide security intelligence across the DeFi landscape.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onNavigate("scanner")} className="btn-primary text-xs py-2.5">Scan Contract</button>
            <button onClick={() => onNavigate("chat")} className="btn-secondary text-xs py-2.5">Ask Axiom</button>
            <button onClick={() => onNavigate("protocols")} className="btn-secondary text-xs py-2.5">Browse Protocols</button>
            <button onClick={() => onNavigate("nosana")} className="btn-secondary text-xs py-2.5">Nosana Health</button>
          </div>
        </div>
      </div>
    </div>
  );
}
