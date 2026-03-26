import React, { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../lib/types";
import { sendMessage } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { ChainBadge } from "./ChainBadge";
import SecurityGauge, { parseSecurityScore } from "./SecurityGauge";

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
          const parsed = parseSecurityScore(msg.text);
          if (!parsed) return null;
          return (
            <div className="mt-3 pt-3 border-t border-zinc-700/50 flex justify-center">
              <SecurityGauge
                score={parsed.score}
                components={parsed.components.length > 0 ? parsed.components : undefined}
                size={140}
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

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: msg, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const response = await sendMessage("default", msg);
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
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">A</span>
                <div className="flex gap-1 text-zinc-400 text-sm">
                  <span>Analyzing</span>
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
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
