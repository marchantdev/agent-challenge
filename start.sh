#!/bin/sh
# Axiom startup script
LOG_FILE="/tmp/elizaos.log"

# Ensure bun and node_modules bins are in PATH (Nosana may not preserve Docker ENV)
export BUN_INSTALL="${BUN_INSTALL:-/root/.bun}"
export PATH="$BUN_INSTALL/bin:/app/node_modules/.bin:$PATH"

log() { echo "[start.sh] $*" | tee -a "$LOG_FILE"; }

log "=== Axiom Container Starting ==="
log "Date: $(date)"
log "OPENAI_BASE_URL=$OPENAI_BASE_URL"
log "NOSANA_INFERENCE_URL=$NOSANA_INFERENCE_URL"
log "bun: $(which bun 2>/dev/null || echo NOT_FOUND)"
log "node: $(which node 2>/dev/null || echo NOT_FOUND)"
log "elizaos: $(which elizaos 2>/dev/null || echo NOT_FOUND)"

log "Starting frontend server..."
node /app/dist/server.js 2>&1 | tee -a "$LOG_FILE" &
SERVER_PID=$!
sleep 3
log "Frontend PID=$SERVER_PID (running=$(kill -0 $SERVER_PID 2>/dev/null && echo yes || echo no))"

# LLM Proxy — intercepts OPENAI_BASE_URL and routes to Nosana node
if [ -n "$OPENAI_BASE_URL" ]; then
  NOSANA_BASE=$(echo "$OPENAI_BASE_URL" | sed 's|/v1/*$||')
  export NOSANA_INFERENCE_URL="$NOSANA_BASE"
  export OPENAI_BASE_URL="http://localhost:4001"
  export LLM_PROXY_PORT="4001"
  log "LLM proxy -> $NOSANA_BASE"
  node /app/dist/llm-proxy.js 2>&1 | tee -a "$LOG_FILE" &
  sleep 2
fi

# ElizaOS — use bun explicitly (elizaos binary is a bun script)
log "=== ElizaOS Launch ==="
log "OPENAI_BASE_URL=$OPENAI_BASE_URL"
log "plugin.js: $(ls -la /app/dist/plugin.js 2>&1)"
log "character: $(ls -la /app/characters/agent.character.json 2>&1)"
log "node_modules/@elizaos/core: $(ls /app/node_modules/@elizaos/core/package.json 2>/dev/null && echo OK || echo MISSING)"

start_elizaos() {
  local attempt="$1"
  log "Starting ElizaOS (attempt $attempt) with bun..."
  bun /app/node_modules/.bin/elizaos start \
    --character /app/characters/agent.character.json 2>&1 | tee -a "$LOG_FILE" &
  echo $!
}

ELIZAOS_PID=$(start_elizaos 1)
log "ElizaOS PID=$ELIZAOS_PID"

# Monitor for 120s — restart up to 2 times if it crashes
attempts=1
i=0
while [ $i -lt 60 ]; do
  sleep 2
  i=$((i + 1))
  if ! kill -0 $ELIZAOS_PID 2>/dev/null; then
    wait $ELIZAOS_PID 2>/dev/null
    EC=$?
    log "!! ElizaOS EXITED after $((i*2))s — exit code $EC !!"
    if [ $attempts -lt 3 ]; then
      attempts=$((attempts + 1))
      log "Restarting ElizaOS (attempt $attempts)..."
      sleep 5
      ELIZAOS_PID=$(start_elizaos $attempts)
      log "New ElizaOS PID=$ELIZAOS_PID"
    else
      log "ElizaOS failed 3 times — giving up. Container stays alive for server."
      break
    fi
  fi
  if [ $i -eq 20 ]; then
    log "ElizaOS running after 40s — OK"
  fi
done

wait $SERVER_PID
