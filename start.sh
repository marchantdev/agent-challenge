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

  # Channel bootstrap — wait for ElizaOS REST API to be ready, then create default channel
  echo "[start.sh] Waiting for ElizaOS API..." >> "$LOG_FILE"
  READY=0
  for j in $(seq 1 30); do
    STATUS=$(bun -e "fetch('http://localhost:3000/api/agents').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; echo $?)
    if [ "$STATUS" = "0" ]; then
      READY=1
      echo "[start.sh] ElizaOS API ready after $((j*2))s" >> "$LOG_FILE"
      break
    fi
    sleep 2
  done

  if [ "$READY" = "1" ]; then
    echo "[start.sh] Bootstrapping default channel..." >> "$LOG_FILE"
    bun -e "
const BASE = 'http://localhost:3000';
const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';
async function bootstrap() {
  const agentsData = await fetch(BASE+'/api/agents').then(r=>r.json()).catch(()=>({}));
  const agents = agentsData?.data?.agents || [];
  if (!agents.length) { console.log('[bootstrap] no agents'); return; }
  const agentId = agents[0].id;
  const serversData = await fetch(BASE+'/api/messaging/message-servers').then(r=>r.json()).catch(()=>({}));
  const servers = serversData?.data?.messageServers || [];
  if (!servers.length) { console.log('[bootstrap] no message servers'); return; }
  const serverId = servers[0].id;
  const chanData = await fetch(BASE+'/api/messaging/central-channels', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name:'General',message_server_id:serverId,participantCentralUserIds:[SYSTEM_USER],type:'GROUP'}),
  }).then(r=>r.json()).catch(()=>({}));
  const channelId = chanData?.data?.id;
  if (!channelId) { console.log('[bootstrap] channel create failed:', JSON.stringify(chanData)); return; }
  await fetch(BASE+'/api/messaging/central-channels/'+channelId+'/agents', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({agentId}),
  }).catch(()=>{});
  console.log('[bootstrap] channel ready:', channelId);
}
bootstrap().catch(e=>console.error('[bootstrap] error:', e.message));
" >> "$LOG_FILE" 2>&1
    echo "[start.sh] Bootstrap complete" >> "$LOG_FILE"
  else
    echo "[start.sh] ElizaOS API not ready after 60s — skipping bootstrap" >> "$LOG_FILE"
  fi
fi

# Keep alive
wait $SERVER_PID
