/**
 * Response formatting helpers for Axiom actions.
 * Produces consistent markdown output across all actions.
 */

export function markdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `|${headers.map(() => "---").join("|")}|`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separator, ...rowLines].join("\n");
}

export function riskBadge(level: string): string {
  switch (level.toLowerCase()) {
    case "critical": return "**CRITICAL**";
    case "high": return "**HIGH**";
    case "medium": return "**MEDIUM**";
    case "low": return "**LOW**";
    default: return `**${level.toUpperCase()}**`;
  }
}

export function formatEthBalance(weiStr: string): string {
  const eth = parseInt(weiStr) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}

export function formatTimeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days > 365) return `${Math.floor(days / 365)} years ago`;
  if (days > 30) return `${Math.floor(days / 30)} months ago`;
  if (days > 0) return `${days} days ago`;
  const hours = Math.floor(ms / 3_600_000);
  return hours > 0 ? `${hours} hours ago` : "recently";
}
