/**
 * Shared rekt.news exploit fetcher.
 * Parses the leaderboard from __NEXT_DATA__ JSON embedded in the HTML.
 * 287 entries available as of March 2026. Free, no auth required.
 */

export interface RektEntry {
  name: string;
  date: string;    // ISO "YYYY-MM-DD"
  amount: number;  // USD
  chain: string;
  technique: string;
}

let rektCache: { data: RektEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseRektDate(dateStr: string): string {
  // Formats: "M/D/YYYY", "MM/DD/YYYY", "MM/DD/YY", "M/D/YY"
  if (!dateStr) return "Unknown";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const [month, day, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const CHAIN_MAP: Record<string, string> = {
  bsc: "BSC",
  "binance smart chain": "BSC",
  ethereum: "Ethereum",
  solana: "Solana",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  avalanche: "Avalanche",
  base: "Base",
  blast: "Blast",
  sui: "Sui",
  "sui network": "Sui",
  tron: "TRON",
  fantom: "Fantom",
  near: "NEAR",
  cosmos: "Cosmos",
  aptos: "Aptos",
  "fantom network": "Fantom",
  "bnb chain": "BSC",
};

function extractChain(tags: string[]): string {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const [key, value] of Object.entries(CHAIN_MAP)) {
      if (lower === key || lower.includes(key)) return value;
    }
  }
  return "Multi";
}

function extractTechnique(title: string, tags: string[]): string {
  const allText = [title, ...tags].join(" ").toLowerCase();
  if (/flash.?loan|flashloan/i.test(allText)) return "Flash Loan";
  if (/reentrancy|re-entr/i.test(allText)) return "Reentrancy";
  if (/oracle|price.?manip/i.test(allText)) return "Oracle Manipulation";
  if (/private.?key|key.?(?:leak|theft|compromise)/i.test(allText)) return "Private Key Compromise";
  if (/admin.?priv|access.?control|privilege/i.test(allText)) return "Access Control";
  if (/rug.?pull|exit.?scam/i.test(allText)) return "Rug Pull";
  if (/governance/i.test(allText)) return "Governance Attack";
  if (/overflow|underflow/i.test(allText)) return "Integer Overflow";
  if (/bridge/i.test(allText)) return "Bridge Exploit";
  if (/multisig/i.test(allText)) return "Multisig Compromise";
  if (/phishing|social.?engin/i.test(allText)) return "Social Engineering";
  return "Unknown";
}

/**
 * Fetch exploits from rekt.news leaderboard.
 * Throws on failure — caller must handle fallback.
 */
export async function fetchRektExploits(): Promise<RektEntry[]> {
  if (rektCache && Date.now() - rektCache.fetchedAt < CACHE_TTL_MS) {
    return rektCache.data;
  }

  const res = await fetch("https://rekt.news/leaderboard/", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`rekt.news returned HTTP ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("__NEXT_DATA__ not found in rekt.news response");

  const nextData = JSON.parse(match[1]) as {
    props?: { pageProps?: { leaderboard?: unknown[] } };
  };
  const leaderboard = nextData?.props?.pageProps?.leaderboard;
  if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
    throw new Error("rekt.news leaderboard data missing or empty");
  }

  const data: RektEntry[] = (
    leaderboard as Array<{
      title: string;
      rekt: { amount?: number; date?: string };
      tags?: string[];
    }>
  )
    .filter((e) => e?.rekt?.amount && e.rekt.amount > 0)
    .map((e) => ({
      name: e.title.replace(/\s*[-\u2013]\s*(REKT|Rekt)\s*\d*\s*$/gi, "").trim(),
      date: parseRektDate(e.rekt.date ?? ""),
      amount: e.rekt.amount as number,
      chain: extractChain(e.tags ?? []),
      technique: extractTechnique(e.title, e.tags ?? []),
    }));

  rektCache = { data, fetchedAt: Date.now() };
  return data;
}
