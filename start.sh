#!/bin/sh
# Axiom startup script
# Server (port 8080) is the MAIN process — stays up even if elizaos crashes.
# elizaos runs in the background; crashes are logged but don't kill the server.

# Ensure node_modules/.bin is in PATH
export PATH="/app/node_modules/.bin:$PATH"

echo "[start.sh] Starting Axiom frontend server on port ${FRONTEND_PORT:-8080}..."
node /app/dist/server.js &
SERVER_PID=$!

# Wait for server to bind
sleep 3

echo "[start.sh] Frontend server running (PID $SERVER_PID)"

# ── LLM Proxy (/v1/responses → chat/completions adapter) ─────────────────────
# ElizaOS v1.7 uses OPENAI_BASE_URL for the inference endpoint.
# The Nosana Qwen model uses /v1/chat/completions; ElizaOS calls /v1/responses.
# We intercept on localhost:4001 and translate.
if [ -n "$OPENAI_BASE_URL" ]; then
  echo "[start.sh] Starting LLM proxy (/v1/responses → chat/completions)..."
  export NOSANA_INFERENCE_URL="$OPENAI_BASE_URL"
  export OPENAI_BASE_URL="http://localhost:4001"
  export LLM_PROXY_PORT="4001"
  node /app/dist/llm-proxy.js &
  LLM_PROXY_PID=$!
  sleep 1
  echo "[start.sh] LLM proxy running (PID $LLM_PROXY_PID) → $NOSANA_INFERENCE_URL"
else
  echo "[start.sh] OPENAI_BASE_URL not set — skipping LLM proxy (no inference endpoint)"
fi

# ── ElizaOS Agent ─────────────────────────────────────────────────────────────
echo "[start.sh] Starting ElizaOS agent in background..."

# Start elizaos in background, tee output to log file for /api/logs endpoint
LOG_FILE="/tmp/elizaos.log"
echo "[start.sh] Logging ElizaOS output to $LOG_FILE"
elizaos start --character /app/characters/agent.character.json >> "$LOG_FILE" 2>&1 &
ELIZAOS_PID=$!

echo "[start.sh] ElizaOS started (PID $ELIZAOS_PID)"

# Keep container alive by waiting on the server process
# If server exits, the container exits. ElizaOS crash is non-fatal.
wait $SERVER_PID
