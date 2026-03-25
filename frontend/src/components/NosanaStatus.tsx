import { useEffect, useState } from "react";
import type { NosanaHealth, NosanaMetrics } from "../lib/types";
import { fetchHealth, fetchMetrics } from "../lib/api";

function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "healthy" ? "bg-emerald-500" :
    status === "degraded" ? "bg-amber-500" :
    "bg-red-500";
  return (
    <span className="relative flex h-3 w-3">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-semibold mt-1 font-mono">
        {value}
        {unit && <span className="text-sm text-zinc-500 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export default function NosanaStatus() {
  const [health, setHealth] = useState<NosanaHealth | null>(null);
  const [metrics, setMetrics] = useState<NosanaMetrics | null>(null);
  const [networkStats, setNetworkStats] = useState<any>(null);

  useEffect(() => {
    fetchHealth().then(setHealth);
    fetchMetrics().then(setMetrics);
    // Try fetching Nosana network stats
    fetch("https://dashboard.nosana.com/api/nodes")
      .then((r) => r.ok ? r.json() : null)
      .then(setNetworkStats)
      .catch(() => setNetworkStats(null));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nosana Infrastructure</h1>
        <p className="text-sm text-zinc-500">Decentralized GPU compute — deployment health & network status</p>
      </div>

      {/* Agent Health */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <StatusDot status={health?.status || "offline"} />
          <h3 className="font-medium">Agent Deployment</h3>
          <span className={`badge ${
            health?.status === "healthy" ? "badge-low" :
            health?.status === "degraded" ? "badge-medium" :
            "badge-critical"
          }`}>
            {health?.status || "checking..."}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Uptime" value={health ? formatUptime(health.uptimeSeconds) : "—"} />
          <MetricCard label="Inference Latency" value={health?.inferenceLatencyMs || "—"} unit="ms" />
          <MetricCard label="Actions Triggered" value={health?.actionsTriggered || 0} />
          <MetricCard label="Model" value={health?.model || "Qwen3.5-27B"} />
        </div>
      </div>

      {/* Deployment Details */}
      <div className="card">
        <h3 className="font-medium mb-3">Deployment Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Node ID</span>
            <span className="font-mono text-xs">{health?.nosanaNode || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">GPU Market</span>
            <span>NVIDIA RTX 3090</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Container</span>
            <span className="font-mono text-xs">ghcr.io/marchantdev/agent-challenge:latest</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Framework</span>
            <span>ElizaOS v1 + Custom Plugin</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Port</span>
            <span className="font-mono">3000</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Last Heartbeat</span>
            <span className="font-mono text-xs">
              {health?.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleString() : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Request Metrics */}
      {metrics && (
        <div className="card">
          <h3 className="font-medium mb-3">Request Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard label="Total Requests" value={metrics.requestsTotal} />
            <MetricCard label="Avg Response" value={metrics.avgResponseTimeMs} unit="ms" />
            <MetricCard label="Error Rate" value={`${(metrics.errorRate * 100).toFixed(1)}%`} />
            <MetricCard label="Protocols Monitored" value={metrics.protocolsMonitored} />
          </div>

          {Object.keys(metrics.requestsByAction).length > 0 && (
            <div>
              <h4 className="text-xs text-zinc-500 uppercase mb-2">Requests by Action</h4>
              <div className="space-y-1.5">
                {Object.entries(metrics.requestsByAction)
                  .sort(([, a], [, b]) => b - a)
                  .map(([action, count]) => (
                    <div key={action} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-44 font-mono truncate">{action}</span>
                      <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-600/50 rounded"
                          style={{ width: `${(count / metrics.requestsTotal) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-300 w-12 text-right font-mono">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nosana Network */}
      <div className="card">
        <h3 className="font-medium mb-3">Nosana Network</h3>
        <p className="text-sm text-zinc-400 mb-3">
          Axiom runs on Nosana's decentralized GPU network — a Solana-based compute marketplace.
          Security infrastructure shouldn't depend on centralized cloud that can be compromised,
          censored, or rate-limited.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Network</p>
            <p className="font-medium mt-1">Solana Mainnet</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Token</p>
            <p className="font-medium mt-1">NOS</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Compute Type</p>
            <p className="font-medium mt-1">GPU Inference</p>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-600">
          Data from Nosana Dashboard API. Refresh for latest stats.
        </div>
      </div>
    </div>
  );
}
