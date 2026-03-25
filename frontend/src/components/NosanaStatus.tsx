import { useEffect, useState } from "react";
import type { NosanaHealth, NosanaMetrics, NosanaNetwork, EvaluatorStats } from "../lib/types";
import { fetchHealth, fetchMetrics, fetchNosanaNetwork, fetchEvaluatorStats, formatNumber } from "../lib/api";

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

function MetricCard({ label, value, unit, accent }: { label: string; value: string | number; unit?: string; accent?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-semibold mt-1 font-mono ${accent || ""}`}>
        {value}
        {unit && <span className="text-sm text-zinc-500 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export default function NosanaStatus() {
  const [health, setHealth] = useState<NosanaHealth | null>(null);
  const [metrics, setMetrics] = useState<NosanaMetrics | null>(null);
  const [network, setNetwork] = useState<NosanaNetwork | null>(null);
  const [evaluatorStats, setEvaluatorStats] = useState<EvaluatorStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    setRefreshing(true);
    Promise.all([
      fetchHealth().then(setHealth),
      fetchMetrics().then(setMetrics),
      fetchNosanaNetwork().then(setNetwork),
      fetchEvaluatorStats().then(setEvaluatorStats),
    ]).finally(() => setRefreshing(false));
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nosana Infrastructure</h1>
          <p className="text-sm text-zinc-500">Decentralized GPU compute &mdash; deployment health & network status</p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="btn-secondary text-xs disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
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
          <MetricCard label="Uptime" value={health ? formatUptime(health.uptimeSeconds) : "\u2014"} />
          <MetricCard label="Inference Latency" value={health?.inferenceLatencyMs || "\u2014"} unit="ms" accent={health && health.inferenceLatencyMs < 500 ? "text-emerald-400" : ""} />
          <MetricCard label="Actions Triggered" value={health?.actionsTriggered || 0} />
          <MetricCard label="Model" value={health?.model || "Qwen3.5-27B"} />
        </div>
      </div>

      {/* Deployment Details */}
      <div className="card">
        <h3 className="font-medium mb-3">Deployment Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            ["Node ID", health?.nosanaNode || "\u2014", true],
            ["GPU Market", "NVIDIA RTX 3090", false],
            ["Container", "ghcr.io/marchantdev/agent-challenge:latest", true],
            ["Framework", "ElizaOS v2 + Custom Plugin", false],
            ["Ports", "3000 (Agent) / 8080 (Frontend)", true],
            ["Last Heartbeat", health?.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleString() : "\u2014", true],
          ].map(([label, value, mono]) => (
            <div key={label as string} className="flex justify-between py-1 border-b border-zinc-800/50 last:border-0">
              <span className="text-zinc-500">{label}</span>
              <span className={mono ? "font-mono text-xs text-zinc-300" : "text-zinc-300"}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Request Metrics */}
      {metrics && (
        <div className="card">
          <h3 className="font-medium mb-3">Request Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <MetricCard label="Total Requests" value={formatNumber(metrics.requestsTotal)} />
            <MetricCard label="Avg Response" value={metrics.avgResponseTimeMs} unit="ms" />
            <MetricCard label="Error Rate" value={`${(metrics.errorRate * 100).toFixed(1)}%`} accent={metrics.errorRate < 0.05 ? "text-emerald-400" : "text-red-400"} />
            <MetricCard label="Protocols Monitored" value={metrics.protocolsMonitored} />
          </div>

          {Object.keys(metrics.requestsByAction).length > 0 && (
            <div>
              <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Requests by Action</h4>
              <div className="space-y-1.5">
                {Object.entries(metrics.requestsByAction)
                  .sort(([, a], [, b]) => b - a)
                  .map(([action, count]) => {
                    const pct = metrics.requestsTotal > 0 ? (count / metrics.requestsTotal) * 100 : 0;
                    return (
                      <div key={action} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-44 font-mono truncate">{action}</span>
                        <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-600/50 to-emerald-500/30 rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-300 w-12 text-right font-mono">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nosana Network */}
      <div className="card">
        <h3 className="font-medium mb-3">Nosana Network</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Axiom runs on Nosana's decentralized GPU network &mdash; a Solana-based compute marketplace.
          Security infrastructure shouldn't depend on centralized cloud that can be compromised,
          censored, or rate-limited.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Total Nodes</p>
            <p className="font-bold text-lg mt-1 font-mono text-emerald-400">{network ? formatNumber(network.totalNodes) : "\u2014"}</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Active Jobs</p>
            <p className="font-bold text-lg mt-1 font-mono">{network ? formatNumber(network.activeJobs) : "\u2014"}</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Network</p>
            <p className="font-medium mt-1">Solana Mainnet</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs">Token</p>
            <p className="font-medium mt-1">NOS</p>
          </div>
        </div>

        {network && network.gpuTypes.length > 0 && (
          <div>
            <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Available GPU Types</h4>
            <div className="flex flex-wrap gap-2">
              {network.gpuTypes.map((gpu) => (
                <span key={gpu} className="badge-info text-xs">{gpu}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Intelligence */}
      <div className="card border-cyan-800/30 bg-cyan-950/5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="font-medium text-cyan-400">Agent Intelligence</h3>
          <span className="badge text-xs bg-cyan-900/40 text-cyan-300 border border-cyan-700/40 ml-auto">
            {evaluatorStats?.evaluator || "responseQualityEvaluator"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MetricCard
            label="Total Assessments"
            value={evaluatorStats ? formatNumber(evaluatorStats.totalResponses) : "—"}
            accent="text-cyan-400"
          />
          <MetricCard
            label="Security Scores"
            value={evaluatorStats ? formatNumber(evaluatorStats.securityScoresIncluded) : "—"}
            accent="text-cyan-400"
          />
          <MetricCard
            label="Recommendations"
            value={evaluatorStats ? formatNumber(evaluatorStats.recommendationsIncluded) : "—"}
            accent="text-cyan-400"
          />
          <MetricCard
            label="Sources Attributed"
            value={evaluatorStats ? formatNumber(evaluatorStats.sourcesAttributed) : "—"}
            accent="text-cyan-400"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Response quality is continuously monitored by <span className="font-mono text-cyan-500">responseQualityEvaluator</span> — verifying that every answer includes structured security scores, risk recommendations, and attributed sources.
        </p>
      </div>

      {/* Cost Efficiency */}
      <div className="card border-emerald-800/30 bg-emerald-950/5">
        <h3 className="font-medium text-emerald-400 mb-3">Cost Efficiency — Why Nosana Makes Economic Sense</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Nosana's decentralized GPU marketplace delivers the same compute at a fraction of centralized cloud pricing.
          Security infrastructure should be affordable, not a budget line item.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Axiom on Nosana</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">~$0.30</p>
            <p className="text-zinc-500 text-xs mt-0.5">per hour · NVIDIA RTX 3090</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">AWS p3.2xlarge</p>
            <p className="text-2xl font-bold font-mono text-red-400">~$3.06</p>
            <p className="text-zinc-500 text-xs mt-0.5">per hour · NVIDIA V100 16GB</p>
          </div>
          <div className="bg-zinc-800 rounded-lg p-3 text-center border border-emerald-800/40">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Savings</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">~90%</p>
            <p className="text-zinc-500 text-xs mt-0.5">$2.76/hr saved on GPU compute</p>
          </div>
        </div>
        <p className="text-xs text-zinc-600">
          Estimates based on Nosana spot pricing and AWS on-demand p3.2xlarge ($3.06/hr). Actual Nosana price varies by market.
        </p>
      </div>

      {/* Why Qwen on Nosana? */}
      <div className="card border-violet-800/30 bg-violet-950/5">
        <h3 className="font-medium text-violet-400 mb-2">Why Qwen on Nosana?</h3>
        <p className="text-sm text-zinc-400">
          Axiom uses <span className="text-zinc-200 font-medium">Qwen3.5-27B</span> running on Nosana&rsquo;s decentralized GPUs instead of proprietary models like GPT-4.
          Same analysis quality. <span className="text-emerald-400 font-medium">90% lower cost.</span> No data leaves the decentralized network.
          Full sovereignty over the security pipeline.
        </p>
      </div>

      {/* Why Decentralized */}
      <div className="card border-emerald-800/30 bg-emerald-950/5">
        <h3 className="font-medium text-emerald-400 mb-2">Why Decentralized Security Infrastructure?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-zinc-400">
          <div>
            <p className="font-medium text-zinc-200 mb-1">Censorship Resistant</p>
            <p>No single entity can shut down or restrict Axiom's security analysis. The agent runs across a distributed network of GPU nodes.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-200 mb-1">Trust-Minimized</p>
            <p>Security tooling running on centralized cloud can be compromised at the infrastructure level. Nosana eliminates this single point of failure.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-200 mb-1">Always Available</p>
            <p>GPU compute is sourced from a marketplace of independent node operators. If one node goes down, the job migrates automatically.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
