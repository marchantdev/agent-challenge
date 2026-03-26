#!/bin/sh
# Axiom startup script
# Starts the frontend/API server FIRST (ensures port 8080 is up for health checks)
# then starts the ElizaOS agent.

set -e

# Ensure node_modules/.bin is in PATH (pnpm adds this automatically in npm scripts,
# but not when running as a direct CMD entrypoint)
export PATH="/app/node_modules/.bin:$PATH"

echo "[start.sh] Starting Axiom frontend server on port ${FRONTEND_PORT:-8080}..."
node /app/dist/server.js &
SERVER_PID=$!

# Brief pause to let the server bind
sleep 2

echo "[start.sh] Frontend server started (PID $SERVER_PID)"
echo "[start.sh] Starting ElizaOS agent..."

# Start elizaos (may take several minutes for LLM initialization)
elizaos start --character /app/characters/agent.character.json

# If elizaos exits, also stop the server
kill $SERVER_PID 2>/dev/null || true
