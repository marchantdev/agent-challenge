# syntax=docker/dockerfile:1

# Stage 1: Build frontend
FROM node:23-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: ElizaOS agent
FROM node:23-slim AS base

# Install system dependencies + bun (required by elizaos CLI)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  curl \
  unzip \
  && rm -rf /var/lib/apt/lists/*

# Install bun runtime (elizaos uses bun as its JS runtime)
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Disable telemetry
ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package manifest and install dependencies
COPY package.json ./
RUN pnpm install

# Copy all source files
COPY . .

# Copy frontend build output
COPY --from=frontend-build /frontend/dist /app/frontend/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000 8080

# Compile TypeScript plugin + standalone server to dist/
RUN pnpm build

# Make startup script executable
RUN chmod +x /app/start.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD curl -f http://localhost:8080/api/health || exit 1

ENV NODE_ENV=production
ENV SERVER_PORT=3000
ENV FRONTEND_PORT=8080

# Start server first (port 8080), then elizaos agent
CMD ["/app/start.sh"]
