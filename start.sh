#!/bin/sh
# Axiom startup script
# Server (port 8080) is the MAIN process — stays up even if elizaos crashes.

LOG_FILE="/tmp/elizaos.log"
echo "[start.sh] === Axiom Container Starting ==="  > "$LOG_FILE"
echo "[start.sh] Date: $(date)" >> "$LOG_FILE"
echo "[start.sh] OPENAI_BASE_URL=$OPENAI_BASE_URL" >> "$LOG_FILE"
echo "[start.sh] NOSANA_INFERENCE_URL=$NOSANA_INFERENCE_URL" >> "$LOG_FILE"
echo "[start.sh] PATH=$PATH" >> "$LOG_FILE"

# Ensure node_modules/.bin is in PATH
export PATH="/app/node_modules/.bin:$PATH"

echo "[start.sh] Starting frontend server on port ${FRONTEND_PORT:-8080}..." >> "$LOG_FILE"
node /app/dist/server.js &
SERVER_PID=$!
sleep 3
echo "[start.sh] Frontend server running (PID $SERVER_PID)" >> "$LOG_FILE"

# ── LLM Proxy ──
if [ -n "$OPENAI_BASE_URL" ]; then
  NOSANA_BASE=$(echo "$OPENAI_BASE_URL" | sed 's|/v1/*$||')
  export NOSANA_INFERENCE_URL="$NOSANA_BASE"
  export OPENAI_BASE_URL="http://localhost:4001"
  export LLM_PROXY_PORT="4001"
  echo "[start.sh] Starting LLM proxy → $NOSANA_BASE" >> "$LOG_FILE"
  node /app/dist/llm-proxy.js >> "$LOG_FILE" 2>&1 &
  LLM_PROXY_PID=$!
  sleep 2
  echo "[start.sh] LLM proxy PID=$LLM_PROXY_PID" >> "$LOG_FILE"
else
  echo "[start.sh] No OPENAI_BASE_URL — skipping proxy" >> "$LOG_FILE"
fi

# ── ElizaOS Agent ──
echo "[start.sh] Checking elizaos binary..." >> "$LOG_FILE"
which elizaos >> "$LOG_FILE" 2>&1
echo "[start.sh] Checking character file..." >> "$LOG_FILE"
ls -la /app/characters/agent.character.json >> "$LOG_FILE" 2>&1
echo "[start.sh] Checking dist/plugin.js..." >> "$LOG_FILE"
ls -la /app/dist/plugin.js >> "$LOG_FILE" 2>&1

echo "[start.sh] Starting ElizaOS agent..." >> "$LOG_FILE"
elizaos start --character /app/characters/agent.character.json >> "$LOG_FILE" 2>&1 &
ELIZAOS_PID=$!
echo "[start.sh] ElizaOS PID=$ELIZAOS_PID" >> "$LOG_FILE"

# Monitor for 30s to catch early crash
sleep 10
if kill -0 $ELIZAOS_PID 2>/dev/null; then
  echo "[start.sh] ElizaOS still running after 10s" >> "$LOG_FILE"
else
  echo "[start.sh] !! ElizaOS CRASHED within 10s !!" >> "$LOG_FILE"
  echo "[start.sh] Exit code: $?" >> "$LOG_FILE"
fi

wait $SERVER_PID
