import React, { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../lib/types";
import { sendMessage, fetchProtocols, detectAnomalies, formatUsd } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { ChainBadge } from "./ChainBadge";
import SecurityGauge, { parseSecurityScore, parseCompareScores } from "./SecurityGauge";

const SUGGESTIONS = [
  "Assess Aave V3 risk",
  "Top DeFi protocols by TVL",
  "Explain flash loan attacks",
  "Latest DeFi exploits",
  "Inspect USDC contract",
  "Nosana network status",
];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-emerald-600/20 border border-emerald-600/30 text-zinc-100"
            : "bg-zinc-800/80 border border-zinc-700 text-zinc-200"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">A</span>
            <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">AXIOM</span>
            {msg.action && <span className="badge-info text-[9px] ml-1">{msg.action}</span>}
            {/\b(ethereum|eth|erc-?20|solidity)\b/i.test(msg.text) && <ChainBadge chain="ethereum" size="xs" />}
            {/\b(solana|sol|spl|anchor)\b/i.test(msg.text) && <ChainBadge chain="solana" size="xs" />}
          </div>
        )}
        <div className="leading-relaxed">
          {isUser ? msg.text : renderMarkdown(msg.text)}
        </div>
        {!isUser && (() => {
          // Compare: side-by-side gauges
          const compare = parseCompareScores(msg.text);
          if (compare) {
            return (
              <div className="mt-3 pt-3 border-t border-zinc-700/50">
                <div className="flex justify-around gap-2">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 mb-1 font-medium truncate max-w-[120px]">{compare.nameA}</span>
                    <SecurityGauge score={compare.scoreA} size={140} />
                  </div>
                  <div className="w-px bg-zinc-700/50 self-stretch" />
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-zinc-500 mb-1 font-medium truncate max-w-[120px]">{compare.nameB}</span>
                    <SecurityGauge score={compare.scoreB} size={140} />
                  </div>
                </div>
              </div>
            );
          }
          // Single protocol: centered gauge
          const parsed = parseSecurityScore(msg.text);
          if (!parsed) return null;
          return (
            <div className="mt-3 pt-3 border-t border-zinc-700/50 flex justify-center">
              <SecurityGauge
                score={parsed.score}
                components={parsed.components.length > 0 ? parsed.components : undefined}
                size={150}
              />
            </div>
          );
        })()}
        <div className="flex items-center justify-between mt-2">
          {!isUser && (
            <span className="text-[9px] text-zinc-600">Inference: Qwen3.5-27B on Nosana GPU</span>
          )}
          <span className={`text-[10px] text-zinc-600 ${isUser ? "" : "ml-auto"}`}>
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "agent",
      text: "Welcome to **Axiom Security Operations Center**.\n\nI'm your DeFi security analyst running on Nosana's decentralized GPU network. I can:\n\n- **Assess protocol risks** with real-time data from DefiLlama\n- **Scan smart contracts** using Etherscan on-chain data\n- **Track exploits** and analyze attack vectors\n- **Monitor the DeFi landscape** for anomalies\n- **Report Nosana network status** and deployment health\n\nWhat would you like to investigate?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Morning briefing — proactive anomaly report on load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const protocols = await fetchProtocols();
        if (cancelled) return;
        const anomalies = detectAnomalies(protocols);
        const totalTvl = protocols.reduce((s, p) => s + p.tvl, 0);
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

        let briefing = `**${greeting}. Live security briefing:**\n\n`;
        briefing += `Monitoring **${protocols.length} protocols** with combined TVL of **${formatUsd(totalTvl)}**.\n\n`;

        if (anomalies.length > 0) {
          briefing += `**⚠ ${anomalies.length} anomal${anomalies.length === 1 ? "y" : "ies"} detected:**\n`;
          for (const a of anomalies.slice(0, 5)) {
            const change = a.change_1d !== null ? `${a.change_1d.toFixed(1)}% (24h)` : `${a.change_7d?.toFixed(1)}% (7d)`;
            briefing += `- **${a.name}** — TVL ${formatUsd(a.tvl)}, ${change}\n`;
          }
          if (anomalies.length > 5) briefing += `- ...and ${anomalies.length - 5} more\n`;
          briefing += `\nClick **"Assess Aave V3 risk"** below for a deep-dive, or ask me anything.`;
        } else {
          briefing += `No anomalies detected. All clear. Ask me about any protocol to investigate.`;
        }

        setMessages((m) => [
          ...m,
          { id: "briefing", role: "agent" as const, text: briefing, timestamp: Date.now() },
        ]);
      } catch { /* silent — briefing is optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: msg, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    let response: string;
    try {
      response = await sendMessage("default", msg);
    } catch {
      response = "⚠️ Axiom is unavailable — agent may still be starting. Try again in a moment.";
    }
    const agentMsg: ChatMessage = { id: `a-${Date.now()}`, role: "agent", text: response, timestamp: Date.now() };
    setMessages((m) => [...m, agentMsg]);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-3rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Chat with Axiom</h1>
        <p className="text-sm text-zinc-500">AI-powered DeFi security analysis on decentralized compute</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg px-4 py-3 max-w-[80%]">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">A</span>
                <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">AXIOM</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-400 text-sm">
                <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <div className="space-y-1">
                  <p className="text-zinc-300">Analyzing your query...</p>
                  <p className="text-[11px] text-zinc-500">Fetching live data from DefiLlama, Etherscan &amp; rekt.news</p>
                  <p className="text-[10px] text-zinc-600">Inference: Qwen3.5-27B on Nosana GPU — this may take up to 60s</p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 3 && !loading && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1.5 text-zinc-400 hover:text-emerald-300 hover:border-emerald-600/40 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ask Axiom about DeFi security..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="btn-primary disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
