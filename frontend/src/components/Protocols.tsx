import { useEffect, useState } from "react";
import type { Protocol } from "../lib/types";
import { fetchProtocols } from "../lib/api";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function ChangeCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-zinc-600">—</span>;
  const cls = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-zinc-400";
  return <span className={cls}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

const CATEGORIES = ["All", "Lending", "Dexes", "Liquid Staking", "Bridge", "CDP", "Yield", "Derivatives", "RWA"];
const CHAINS = ["All", "Ethereum", "Solana", "BSC", "Arbitrum", "Polygon", "Avalanche", "Base", "Optimism"];

type SortKey = "tvl" | "change_1d" | "change_7d" | "name";

export default function Protocols() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [chain, setChain] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("tvl");
  const [sortAsc, setSortAsc] = useState(false);

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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Protocol Monitor</h1>
        <p className="text-sm text-zinc-500">Live DeFi protocol data from DefiLlama</p>
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
                  <tr key={p.slug} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{p.category}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs font-mono">
                      {p.chains.slice(0, 3).join(", ")}
                      {p.chains.length > 3 && ` +${p.chains.length - 3}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatUsd(p.tvl)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <ChangeCell value={p.change_1d} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      <ChangeCell value={p.change_7d} />
                    </td>
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
