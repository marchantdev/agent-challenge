import { useEffect, useState, useRef } from "react";

interface GaugeProps {
  score: number; // 0-10
  label?: string;
  components?: { name: string; score: number }[];
  size?: number;
}

function getRiskLevel(score: number): { label: string; color: string; arcColor: string; arcColorFaint: string } {
  if (score >= 8) return { label: "Low Risk", color: "text-emerald-400", arcColor: "#34d399", arcColorFaint: "#34d39920" };
  if (score >= 6) return { label: "Medium Risk", color: "text-amber-400", arcColor: "#fbbf24", arcColorFaint: "#fbbf2420" };
  if (score >= 4) return { label: "High Risk", color: "text-orange-400", arcColor: "#fb923c", arcColorFaint: "#fb923c20" };
  return { label: "Critical Risk", color: "text-red-400", arcColor: "#f87171", arcColorFaint: "#f8717120" };
}

function useAnimatedValue(target: number, duration = 800): number {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const from = ref.current;
    if (from === target) return;
    const start = performance.now();
    cancelAnimationFrame(frame.current);

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * eased;
      ref.current = v;
      setVal(v);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return val;
}

// Stable ID derived from label (or random fallback)
let idCounter = 0;
function useStableId(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) ref.current = `${prefix}-${++idCounter}`;
  return ref.current;
}

export default function SecurityGauge({ score, label, components, size = 200 }: GaugeProps) {
  const animated = useAnimatedValue(score);
  const { label: riskLabel, color, arcColor, arcColorFaint } = getRiskLevel(score);
  const gradId = useStableId("arcGrad");

  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = size / 2 - 18;
  const strokeWidth = 12;

  // Semicircle arc (180 degrees, from left to right)
  const startAngle = Math.PI; // left
  const endAngle = 0; // right
  const fraction = animated / 10;

  // Background arc path
  const bgPath = describeArc(cx, cy, r, startAngle, endAngle);
  // Value arc path
  const valAngle = startAngle + (endAngle - startAngle) * fraction;
  const valPath = fraction > 0.01 ? describeArc(cx, cy, r, startAngle, valAngle) : "";

  // Gradient spans from left end to right end of the arc
  const gradX1 = cx - r;
  const gradX2 = cx + r;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 28} viewBox={`0 0 ${size} ${size / 2 + 28}`}>
        <defs>
          <linearGradient id={gradId} x1={gradX1} y1={0} x2={gradX2} y2={0} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={arcColorFaint} />
            <stop offset="60%" stopColor={arcColor} stopOpacity={0.7} />
            <stop offset="100%" stopColor={arcColor} />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#27272a" strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Value arc — gradient stroke */}
        {valPath && (
          <path
            d={valPath}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${arcColor}50)` }}
          />
        )}

        {/* Score text */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-zinc-100 font-bold font-mono" fontSize="30">
          {animated.toFixed(1)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-zinc-500 text-xs" fontSize="12">
          / 10
        </text>
      </svg>

      {/* Risk label */}
      <span className={`text-xs font-semibold mt-1 ${color}`}>{riskLabel}</span>
      {label && <span className="text-[10px] text-zinc-500 mt-0.5">{label}</span>}

      {/* Component breakdown */}
      {components && components.length > 0 && (
        <div className="w-full mt-3 space-y-1.5">
          {components.map((c) => {
            const { arcColor: barColor } = getRiskLevel(c.score);
            const pct = (c.score / 10) * 100;
            return (
              <div key={c.name} className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-24 truncate text-right">{c.name}</span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-400 w-6 text-right">{c.score.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper: describe an SVG arc path between two angles
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy - r * Math.sin(endAngle);

  // For semicircle, always use sweep-flag=0 (counter-clockwise from left to right in SVG coords)
  const diff = startAngle - endAngle;
  const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
}

// Helper: parse security scores from agent text (best-effort)
// Handles both /10 and /100 scale (assessRisk/generateAuditReport emit /100)
export function parseSecurityScore(text: string): { score: number; components: { name: string; score: number }[] } | null {
  // Try /100 scale first (assessRisk.ts: "Security Score: 75/100")
  const match100 = text.match(/(?:security\s+score|overall\s*(?:score)?|risk\s+score)[:\s]*(\d+(?:\.\d+)?)\s*\/\s*100/i);
  if (match100) {
    const score = parseFloat(match100[1]) / 10; // normalize to 0-10
    const components: { name: string; score: number }[] = [];

    // Component scores are out of /25 in table format: "| TVL Stability | 22 | 25 |" or "| TVL Stability | 22/25 |"
    const compPatterns: { pattern: RegExp; name: string }[] = [
      { pattern: /\|\s*TVL Stability\s*\|\s*(\d+(?:\.\d+)?)\s*(?:\/25)?[\s|]/, name: "TVL Stability" },
      { pattern: /\|\s*(?:Audit\s*Coverage|Verification)\s*\|\s*(\d+(?:\.\d+)?)\s*(?:\/25)?[\s|]/, name: "Audit Coverage" },
      { pattern: /\|\s*(?:Protocol\s*)?Maturity\s*\|\s*(\d+(?:\.\d+)?)\s*(?:\/25)?[\s|]/, name: "Protocol Maturity" },
      { pattern: /\|\s*Exploit\s*History\s*\|\s*(\d+(?:\.\d+)?)\s*(?:\/25)?[\s|]/, name: "Exploit History" },
    ];
    for (const { pattern, name } of compPatterns) {
      const m = text.match(pattern);
      if (m) components.push({ name, score: (parseFloat(m[1]) / 25) * 10 }); // normalize /25 → /10
    }

    return { score, components };
  }

  // Fall back to /10 scale
  const match10 = text.match(/(?:security\s+score|overall\s*(?:score)?|risk\s+score)[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/i);
  if (!match10) return null;

  const score = parseFloat(match10[1]);
  const components: { name: string; score: number }[] = [];

  const componentPatterns = [
    { pattern: /tvl\s*(?:stability)?[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/i, name: "TVL Stability" },
    { pattern: /audit\s*(?:coverage)?[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/i, name: "Audit Coverage" },
    { pattern: /(?:protocol\s*)?maturity[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/i, name: "Protocol Maturity" },
    { pattern: /exploit\s*(?:history)?[:\s]*(\d+(?:\.\d+)?)\s*\/\s*10(?!\d)/i, name: "Exploit History" },
  ];

  for (const { pattern, name } of componentPatterns) {
    const m = text.match(pattern);
    if (m) components.push({ name, score: parseFloat(m[1]) });
  }

  return { score, components };
}

// Helper: parse two security scores from a COMPARE_PROTOCOLS response
export function parseCompareScores(text: string): {
  nameA: string; scoreA: number;
  nameB: string; scoreB: number;
} | null {
  // Match "### Protocol Comparison: A vs B"
  const titleMatch = text.match(/Protocol Comparison:\s*(.+?)\s+vs\s+(.+?)(?:\n|$)/m);
  if (!titleMatch) return null;

  const nameA = titleMatch[1].trim();
  const nameB = titleMatch[2].trim();

  // Match "| Security Score | 75/100 | 68/100 |"
  const scoreMatch = text.match(/\|\s*Security Score\s*\|\s*(\d+)\/100\s*\|\s*(\d+)\/100\s*\|/);
  if (!scoreMatch) return null;

  return {
    nameA,
    scoreA: parseInt(scoreMatch[1]) / 10, // convert to 0-10 scale for SecurityGauge
    nameB,
    scoreB: parseInt(scoreMatch[2]) / 10,
  };
}
