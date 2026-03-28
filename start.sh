#!/bin/sh
# Axiom startup script
LOG_FILE="/tmp/elizaos.log"
echo "[start.sh] === Axiom Container Starting ===" > "$LOG_FILE"
echo "[start.sh] Date: $(date)" >> "$LOG_FILE"
echo "[start.sh] OPENAI_BASE_URL=$OPENAI_BASE_URL" >> "$LOG_FILE"
echo "[start.sh] NOSANA_INFERENCE_URL=$NOSANA_INFERENCE_URL" >> "$LOG_FILE"

export PATH="/root/.bun/bin:/app/node_modules/.bin:$PATH"

# Frontend server
echo "[start.sh] Starting frontend server..." >> "$LOG_FILE"
node /app/dist/server.js >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
sleep 3
echo "[start.sh] Frontend PID=$SERVER_PID" >> "$LOG_FILE"

# LLM Proxy
if [ -n "$OPENAI_BASE_URL" ]; then
  NOSANA_BASE=$(echo "$OPENAI_BASE_URL" | sed 's|/v1/*$||')
  export NOSANA_INFERENCE_URL="$NOSANA_BASE"
  export OPENAI_BASE_URL="http://localhost:4001"
  export LLM_PROXY_PORT="4001"
  echo "[start.sh] LLM proxy -> $NOSANA_BASE" >> "$LOG_FILE"
  node /app/dist/llm-proxy.js >> "$LOG_FILE" 2>&1 &
  sleep 2
fi

# ElizaOS — run the ACTUAL bun entry point, not the pnpm shell wrapper
# The shell wrapper at node_modules/.bin/elizaos breaks when run with bun
# The real entry point is node_modules/@elizaos/cli/dist/index.js
ELIZAOS_ENTRY="/app/node_modules/@elizaos/cli/dist/index.js"
echo "[start.sh] === ElizaOS Launch ===" >> "$LOG_FILE"
echo "[start.sh] Entry: $ELIZAOS_ENTRY" >> "$LOG_FILE"
echo "[start.sh] OPENAI_BASE_URL=$OPENAI_BASE_URL" >> "$LOG_FILE"

if [ ! -f "$ELIZAOS_ENTRY" ]; then
  echo "[start.sh] !! FATAL: $ELIZAOS_ENTRY not found !!" >> "$LOG_FILE"
  ls -la /app/node_modules/@elizaos/cli/dist/ >> "$LOG_FILE" 2>&1
else
  echo "[start.sh] Starting: bun $ELIZAOS_ENTRY start --character /app/characters/agent.character.json" >> "$LOG_FILE"
  bun "$ELIZAOS_ENTRY" start --character /app/characters/agent.character.json >> "$LOG_FILE" 2>&1 &
  ELIZAOS_PID=$!
  echo "[start.sh] ElizaOS PID=$ELIZAOS_PID" >> "$LOG_FILE"

  # Monitor
  i=0
  while [ $i -lt 15 ]; do
    sleep 2
    i=$((i + 1))
    if ! kill -0 $ELIZAOS_PID 2>/dev/null; then
      wait $ELIZAOS_PID 2>/dev/null
      EC=$?
      echo "[start.sh] !! ElizaOS EXITED after $((i*2))s — code $EC !!" >> "$LOG_FILE"
      break
    fi
    if [ $i -eq 15 ]; then
      echo "[start.sh] ElizaOS running after 30s — OK" >> "$LOG_FILE"
    fi
  done
fi

# Keep alive
wait $SERVER_PID
