/**
 * LLM Proxy — chat/completions → /v1/responses adapter
 *
 * The Nosana-hosted Qwen model uses the OpenAI Responses API (/v1/responses)
 * rather than the legacy Chat Completions API (/v1/chat/completions).
 * ElizaOS's @elizaos/plugin-openai always calls /v1/chat/completions, so
 * this proxy intercepts those calls and translates them.
 *
 * Run on localhost:4001 (LLM_PROXY_PORT).
 * Set OPENAI_API_URL=http://localhost:4001 for ElizaOS.
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

/** Convert OpenAI chat/completions request body → /v1/responses request body */
function chatToResponses(body: any): any {
  const messages: Array<{ role: string; content: string }> = body.messages || [];

  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  const req: any = {
    model: body.model,
    input: conversationMessages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  };

  if (systemMessages.length > 0) {
    req.instructions = systemMessages.map((m) => m.content).join("\n\n");
  }

  if (body.temperature !== undefined) req.temperature = body.temperature;
  if (body.max_tokens !== undefined) req.max_output_tokens = body.max_tokens;
  if (body.stream) req.stream = body.stream;

  return req;
}

/** Convert /v1/responses response body → chat/completions response body */
function responsesToChat(data: any, originalModel: string): any {
  // Extract text from response output
  let text = "";
  const output = data.output;
  if (Array.isArray(output) && output.length > 0) {
    const firstOutput = output[0];
    if (Array.isArray(firstOutput?.content) && firstOutput.content.length > 0) {
      text = firstOutput.content[0]?.text || "";
    } else if (typeof firstOutput?.content === "string") {
      text = firstOutput.content;
    } else if (typeof firstOutput?.text === "string") {
      text = firstOutput.text;
    }
  } else if (typeof output === "string") {
    text = output;
  }

  return {
    id: data.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: data.created_at || Math.floor(Date.now() / 1000),
    model: data.model || originalModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.incomplete_details ? "length" : "stop",
      },
    ],
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
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

  // Intercept POST /v1/chat/completions → translate to /v1/responses
  if (method === "POST" && (url === "/v1/chat/completions" || url.endsWith("/chat/completions"))) {
    try {
      const rawBody = await readBody(req);
      const chatReq = JSON.parse(rawBody);
      const responsesReq = chatToResponses(chatReq);

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
        body: JSON.stringify(responsesReq),
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

      const responseData = JSON.parse(upstreamText);
      const chatResponse = responsesToChat(responseData, chatReq.model || "");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(chatResponse));
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      console.error(`[LLM Proxy] Error: ${err.message}`);
      res.writeHead(isTimeout ? 504 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: isTimeout ? "LLM timeout" : err.message }));
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
  console.log(`[LLM Proxy] Translating chat/completions → ${NOSANA_INFERENCE_URL}/v1/responses`);
});
