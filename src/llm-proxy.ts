/**
 * LLM Proxy — /v1/responses → chat/completions adapter
 *
 * ElizaOS v1.7+ calls the OpenAI Responses API (/v1/responses) by default.
 * Nosana-hosted Qwen only supports the Chat Completions API (/v1/chat/completions).
 * This proxy intercepts /v1/responses calls and translates them to /v1/chat/completions.
 *
 * Run on localhost:4001 (LLM_PROXY_PORT).
 * Set OPENAI_BASE_URL=http://localhost:4001 for ElizaOS.
 * Set NOSANA_INFERENCE_URL to the actual Nosana inference endpoint.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PROXY_PORT = parseInt(process.env.LLM_PROXY_PORT || "4001");
const NOSANA_INFERENCE_URL = (process.env.NOSANA_INFERENCE_URL || "").replace(/\/$/, "");
const API_KEY = process.env.OPENAI_API_KEY || "nosana-inference";

if (!NOSANA_INFERENCE_URL) {
  console.error("[LLM Proxy] ERROR: NOSANA_INFERENCE_URL is not set");
  process.exit(1);
}

/** Convert OpenAI Responses API request body → chat/completions request body */
function responsesToChat(body: any): any {
  const input: Array<{ role: string; content: string }> = body.input || [];
  const instructions: string | undefined = body.instructions;

  const messages: Array<{ role: string; content: string }> = [];

  // instructions → system message
  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  // input items → messages
  for (const item of input) {
    messages.push({
      role: item.role,
      content: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
    });
  }

  const req: any = {
    model: body.model,
    messages,
  };

  if (body.temperature !== undefined) req.temperature = body.temperature;
  if (body.max_output_tokens !== undefined) req.max_tokens = body.max_output_tokens;
  if (body.stream) req.stream = body.stream;

  return req;
}

/** Convert chat/completions response body → /v1/responses response body */
function chatToResponses(data: any): any {
  const choice = data.choices?.[0];
  const text = choice?.message?.content || "";

  return {
    id: data.id || `resp-${Date.now()}`,
    object: "response",
    created_at: data.created || Math.floor(Date.now() / 1000),
    model: data.model || "",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || "/";
  const method = req.method || "GET";

  // Intercept POST /v1/responses → translate to /v1/chat/completions
  if (method === "POST" && (url === "/v1/responses" || url.endsWith("/responses"))) {
    try {
      const rawBody = await readBody(req);
      const responsesReq = JSON.parse(rawBody);
      const chatReq = responsesToChat(responsesReq);

      console.log(
        `[LLM Proxy] /v1/responses → chat/completions | model=${responsesReq.model} | input=${responsesReq.input?.length}`
      );

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 120000);

      const upstream = await fetch(`${NOSANA_INFERENCE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(chatReq),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      const upstreamText = await upstream.text();

      if (!upstream.ok) {
        console.error(`[LLM Proxy] Upstream error ${upstream.status}: ${upstreamText.slice(0, 200)}`);
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(upstreamText);
        return;
      }

      const chatResponse = JSON.parse(upstreamText);
      const responsesResponse = chatToResponses(chatResponse);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responsesResponse));
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      console.error(`[LLM Proxy] Error: ${err.message}`);
      res.writeHead(isTimeout ? 504 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: isTimeout ? "LLM timeout" : err.message }));
    }
    return;
  }

  // Also intercept POST /v1/chat/completions in case ElizaOS falls back to it —
  // forward directly to Nosana without translation
  if (method === "POST" && (url === "/v1/chat/completions" || url.endsWith("/chat/completions"))) {
    try {
      const rawBody = await readBody(req);
      const chatReq = JSON.parse(rawBody);

      console.log(
        `[LLM Proxy] chat/completions passthrough | model=${chatReq.model} | msgs=${chatReq.messages?.length}`
      );

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 120000);

      const upstream = await fetch(`${NOSANA_INFERENCE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: rawBody,
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      const data = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (err: any) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Pass all other requests (e.g. /v1/models) directly to the Nosana endpoint
  try {
    const rawBody = await readBody(req);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30000);

    const upstream = await fetch(`${NOSANA_INFERENCE_URL}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: method !== "GET" && rawBody ? rawBody : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    const data = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(data);
  } catch (err: any) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`[LLM Proxy] Listening on localhost:${PROXY_PORT}`);
  console.log(`[LLM Proxy] Translating /v1/responses → ${NOSANA_INFERENCE_URL}/v1/chat/completions`);
});
