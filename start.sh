#!/bin/sh
# Axiom startup script — debug version
LOG_FILE="/tmp/elizaos.log"
echo "[start.sh] === Axiom Container Starting ===" > "$LOG_FILE"
echo "[start.sh] Date: $(date)" >> "$LOG_FILE"
echo "[start.sh] OPENAI_BASE_URL=$OPENAI_BASE_URL" >> "$LOG_FILE"
echo "[start.sh] NOSANA_INFERENCE_URL=$NOSANA_INFERENCE_URL" >> "$LOG_FILE"

export PATH="/app/node_modules/.bin:$PATH"

echo "[start.sh] Starting frontend server..." >> "$LOG_FILE"
node /app/dist/server.js &
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

# ElizaOS — capture everything
echo "[start.sh] === ElizaOS Launch ===" >> "$LOG_FILE"
echo "[start.sh] OPENAI_BASE_URL=$OPENAI_BASE_URL" >> "$LOG_FILE"
echo "[start.sh] which elizaos: $(which elizaos)" >> "$LOG_FILE"
echo "[start.sh] plugin.js: $(ls -la /app/dist/plugin.js 2>&1)" >> "$LOG_FILE"
echo "[start.sh] character: $(ls -la /app/characters/agent.character.json 2>&1)" >> "$LOG_FILE"

# Run elizaos and capture exit
elizaos start --character /app/characters/agent.character.json >> "$LOG_FILE" 2>&1 &
ELIZAOS_PID=$!
echo "[start.sh] ElizaOS PID=$ELIZAOS_PID" >> "$LOG_FILE"

# Monitor every 2s
i=0
while [ $i -lt 30 ]; do
  sleep 2
  i=$((i + 1))
  if ! kill -0 $ELIZAOS_PID 2>/dev/null; then
    wait $ELIZAOS_PID 2>/dev/null
    EC=$?
    echo "[start.sh] !! ElizaOS EXITED after $((i*2))s — exit code $EC !!" >> "$LOG_FILE"
    # Try running with node directly to see error
    echo "[start.sh] === Retry with node directly ===" >> "$LOG_FILE"
    ELIZAOS_BIN=$(readlink -f /app/node_modules/.bin/elizaos 2>/dev/null || echo "/app/node_modules/.bin/elizaos")
    echo "[start.sh] elizaos resolves to: $ELIZAOS_BIN" >> "$LOG_FILE"
    ls -la "$ELIZAOS_BIN" >> "$LOG_FILE" 2>&1
    file "$ELIZAOS_BIN" >> "$LOG_FILE" 2>&1
    # Try running it
    node "$ELIZAOS_BIN" start --character /app/characters/agent.character.json >> "$LOG_FILE" 2>&1 &
    RETRY_PID=$!
    sleep 15
    if kill -0 $RETRY_PID 2>/dev/null; then
      echo "[start.sh] Retry running OK — keeping alive" >> "$LOG_FILE"
      ELIZAOS_PID=$RETRY_PID
    else
      wait $RETRY_PID 2>/dev/null
      echo "[start.sh] Retry also failed with code $?" >> "$LOG_FILE"
    fi
    break
  fi
  if [ $i -eq 15 ]; then
    echo "[start.sh] ElizaOS running after 30s — OK" >> "$LOG_FILE"
  fi
done

wait $SERVER_PID
