#!/bin/sh
# Axiom startup script
# Starts the frontend/API server FIRST (ensures port 8080 is up for health checks)
# then starts the ElizaOS agent in the background.
# This prevents x-frp-service-state: loading when elizaos takes time to initialize.

set -e

echo "[start.sh] Starting Axiom frontend server on port ${FRONTEND_PORT:-8080}..."
node /app/dist/server.js &
SERVER_PID=$!

# Brief pause to let the server bind the port
sleep 2

echo "[start.sh] Frontend server PID: $SERVER_PID"
echo "[start.sh] Starting ElizaOS agent..."

# Start elizaos (this may take several minutes for LLM initialization)
elizaos start --character /app/characters/agent.character.json

# If elizaos exits, also stop the server
kill $SERVER_PID 2>/dev/null || true
