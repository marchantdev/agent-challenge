const CHAIN_STYLES: Record<string, string> = {
  ethereum: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  solana: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  bsc: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  arbitrum: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  polygon: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  avalanche: "bg-red-500/15 text-red-400 border-red-500/20",
  base: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  optimism: "bg-red-500/15 text-red-300 border-red-500/20",
  multi: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "ETH",
  solana: "SOL",
  bsc: "BNB",
  arbitrum: "ARB",
  polygon: "MATIC",
  avalanche: "AVAX",
  base: "BASE",
  optimism: "OP",
  multi: "MULTI",
};

export function ChainBadge({ chain, size = "sm" }: { chain: string; size?: "sm" | "xs" }) {
  const key = chain.toLowerCase();
  const style = CHAIN_STYLES[key] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  const label = CHAIN_LABELS[key] || chain.slice(0, 5).toUpperCase();
  const cls = size === "xs"
    ? "text-[9px] px-1.5 py-0.5"
    : "text-[10px] px-2 py-0.5";
  return (
    <span className={`inline-flex items-center rounded border font-semibold tracking-wide ${style} ${cls}`}>
      {label}
    </span>
  );
}

export function detectChain(address: string): "ethereum" | "solana" | "unknown" {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "ethereum";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return "unknown";
}
