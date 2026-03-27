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

  // Intercept POST /responses or /v1/responses — pass through to Nosana at /v1/responses
  // Nosana Qwen uses the OpenAI Responses API format at /v1/responses.
  // ElizaOS plugin-openai calls OPENAI_BASE_URL + "/responses" (no /v1 prefix).
  // We just add /v1 prefix and forward unchanged — no body transformation needed.
  if (method === "POST" && (url === "/v1/responses" || url === "/responses" || url.endsWith("/responses"))) {
    try {
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody);

      console.log(
        `[LLM Proxy] /responses passthrough → ${NOSANA_INFERENCE_URL}/v1/responses | model=${parsed.model}`
      );

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 120000);

      const upstream = await fetch(`${NOSANA_INFERENCE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: rawBody,
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

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(upstreamText);
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      console.error(`[LLM Proxy] Error: ${err.message}`);
      res.writeHead(isTimeout ? 504 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: isTimeout ? "LLM timeout" : err.message }));
    }
    return;
  }

  // Also intercept POST /v1/chat/completions or /chat/completions —
  // translate from Chat Completions to Responses API format for Nosana
  if (method === "POST" && (url === "/v1/chat/completions" || url === "/chat/completions" || url.endsWith("/chat/completions"))) {
    try {
      const rawBody = await readBody(req);
      const chatReq = JSON.parse(rawBody);

      // Convert chat/completions format → responses format
      const messages: Array<{ role: string; content: string }> = chatReq.messages || [];
      const systemMsg = messages.find((m) => m.role === "system");
      const userMsgs = messages.filter((m) => m.role !== "system");

      const responsesBody: any = {
        model: chatReq.model,
        input: userMsgs.map((m) => ({ role: m.role, content: m.content })),
      };
      if (systemMsg) responsesBody.instructions = systemMsg.content;
      if (chatReq.max_tokens !== undefined) responsesBody.max_output_tokens = chatReq.max_tokens;
      if (chatReq.temperature !== undefined) responsesBody.temperature = chatReq.temperature;

      console.log(
        `[LLM Proxy] chat/completions → /v1/responses | model=${chatReq.model} | msgs=${chatReq.messages?.length}`
      );

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 120000);

      const upstream = await fetch(`${NOSANA_INFERENCE_URL}/v1/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(responsesBody),
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

      // Convert Responses API response back to Chat Completions format
      const responsesResp = JSON.parse(upstreamText);
      const text = responsesResp.output?.[0]?.content?.[0]?.text || "";
      const chatResp = {
        id: responsesResp.id || `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: responsesResp.created_at || Math.floor(Date.now() / 1000),
        model: responsesResp.model || chatReq.model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: responsesResp.usage?.input_tokens || 0,
          completion_tokens: responsesResp.usage?.output_tokens || 0,
          total_tokens: responsesResp.usage?.total_tokens || 0,
        },
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(chatResp));
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
