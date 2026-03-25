import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../lib/types";
import { sendMessage } from "../lib/api";

const SUGGESTIONS = [
  "Assess the risk of Aave V3",
  "Show me top DeFi protocols by TVL",
  "Explain flash loan attacks",
  "What are the latest DeFi exploits?",
  "Security brief for a lending protocol",
  "Scan the Uniswap V3 repo",
];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-emerald-600/20 border border-emerald-600/30 text-zinc-100"
            : "bg-zinc-800 border border-zinc-700 text-zinc-200"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-4 h-4 rounded bg-emerald-600 flex items-center justify-center text-[8px] font-bold text-white">A</span>
            <span className="text-[10px] text-emerald-400 font-medium">AXIOM</span>
            {msg.action && <span className="badge-info text-[9px]">{msg.action}</span>}
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
        <div className="text-[10px] text-zinc-600 mt-1 text-right">
          {new Date(msg.timestamp).toLocaleTimeString()}
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
      text: "Welcome to Axiom. I'm your DeFi security analyst running on Nosana's decentralized GPU network.\n\nI can assess protocol risks, scan smart contracts, track exploits, and monitor the DeFi landscape. What would you like to investigate?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const response = await sendMessage("default", text);

    const agentMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: "agent",
      text: response,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, agentMsg]);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-3rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Chat with Axiom</h1>
        <p className="text-sm text-zinc-500">AI-powered DeFi security analysis</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-400">
              <div className="flex gap-1">
                <span className="animate-pulse">Analyzing</span>
                <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setInput(s); }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1.5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ask Axiom about DeFi security..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()} className="btn-primary disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
