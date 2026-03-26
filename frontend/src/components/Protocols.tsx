import { useEffect, useState } from "react";
import type { Protocol, View } from "../lib/types";
import { fetchProtocols, formatUsd } from "../lib/api";
import { ChainBadge } from "./ChainBadge";

function ChangeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-zinc-600">&mdash;</span>;
  const cls = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-zinc-400";
  return <span className={cls}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function RiskIndicator({ protocol }: { protocol: Protocol }) {
  const has1dDrop = protocol.change_1d !== null && protocol.change_1d < -10;
  const has7dDrop = protocol.change_7d !== null && protocol.change_7d < -20;
  if (has1dDrop || has7dDrop) {
    return (
      <span className="relative flex h-2 w-2" title="TVL anomaly detected">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
    );
  }
  const hasMildDrop = protocol.change_1d !== null && protocol.change_1d < -5;
  if (hasMildDrop) {
    return <span className="inline-flex rounded-full h-2 w-2 bg-amber-500" title="Moderate TVL decrease" />;
  }
  return <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500/50" />;
}

const CATEGORIES = ["All", "Lending", "Dexes", "Liquid Staking", "Bridge", "CDP", "Yield", "Derivatives", "RWA"];
const CHAINS = ["All", "Ethereum", "Solana", "BSC", "Arbitrum", "Polygon", "Avalanche", "Base", "Optimism"];

type SortKey = "tvl" | "change_1d" | "change_7d" | "name";

export default function Protocols({ onNavigate }: { onNavigate?: (v: View) => void }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [chain, setChain] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("tvl");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Protocol | null>(null);

  useEffect(() => {
    fetchProtocols()
      .then(setProtocols)
      .catch(() => setProtocols([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = protocols
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== "All" && p.category.toLowerCase() !== category.toLowerCase()) return false;
      if (chain !== "All" && !p.chains.some((c) => c.toLowerCase() === chain.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortBy === "name") return dir * a.name.localeCompare(b.name);
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      return dir * ((av as number) - (bv as number));
    });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortBy === k ? <span className="ml-1">{sortAsc ? "\u25b2" : "\u25bc"}</span> : null;

  const totalTvl = filtered.reduce((s, p) => s + p.tvl, 0);
  const anomalyCount = filtered.filter(
    (p) => (p.change_1d !== null && p.change_1d < -10) || (p.change_7d !== null && p.change_7d < -20)
  ).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Protocol Monitor</h1>
          <p className="text-sm text-zinc-500">Live DeFi protocol data from DefiLlama</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>TVL: <span className="text-zinc-300 font-mono">{formatUsd(totalTvl)}</span></span>
          {anomalyCount > 0 && (
            <span className="text-amber-400">
              {anomalyCount} anomal{anomalyCount === 1 ? "y" : "ies"}
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input w-48"
          placeholder="Search protocols..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={chain} onChange={(e) => setChain(e.target.value)}>
          {CHAINS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{filtered.length} protocols</span>
      </div>

      {/* Selected protocol detail */}
      {selected && (
        <div className="card border-emerald-800/50 bg-emerald-950/10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-emerald-400">{selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-xs text-zinc-500 hover:text-zinc-300">&times; Close</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-zinc-500 text-xs">Category</p>
              <p className="mt-0.5">{selected.category}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">TVL</p>
              <p className="mt-0.5 font-mono">{formatUsd(selected.tvl)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">24h Change</p>
              <p className="mt-0.5 font-mono"><ChangeCell value={selected.change_1d} /></p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Chains</p>
              <p className="mt-0.5 text-xs font-mono">{selected.chains.join(", ")}</p>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate("chat")}
              className="mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Ask Axiom to analyze {selected.name} &rarr;
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card text-center py-12 text-zinc-500">Loading protocol data...</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
                  <th className="text-left px-4 py-3 w-8">#</th>
                  <th className="text-center px-2 py-3 w-8"></th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-zinc-300" onClick={() => toggleSort("name")}>
                    Name<SortArrow k="name" />
                  </th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Chains</th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-zinc-300" onClick={() => toggleSort("tvl")}>
                    TVL<SortArrow k="tvl" />
                  </th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-zinc-300" onClick={() => toggleSort("change_1d")}>
                    24h<SortArrow k="change_1d" />
                  </th>
                  <th className="text-right px-4 py-3 cursor-pointer hover:text-zinc-300" onClick={() => toggleSort("change_7d")}>
                    7d<SortArrow k="change_7d" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((p, i) => (
                  <tr
                    key={p.slug}
                    onClick={() => setSelected(p)}
                    className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${
                      selected?.slug === p.slug
                        ? "bg-emerald-950/20"
                        : "hover:bg-zinc-800/30"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{i + 1}</td>
                    <td className="px-2 py-2.5 text-center"><RiskIndicator protocol={p} /></td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{p.category}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.chains.slice(0, 3).map((c) => (
                          <ChainBadge key={c} chain={c} size="xs" />
                        ))}
                        {p.chains.length > 3 && (
                          <span className="text-[9px] text-zinc-600 self-center">+{p.chains.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatUsd(p.tvl)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs"><ChangeCell value={p.change_1d} /></td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs"><ChangeCell value={p.change_7d} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
