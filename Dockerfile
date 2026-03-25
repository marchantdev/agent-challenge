# syntax=docker/dockerfile:1

# Stage 1: Build frontend
FROM node:23-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
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

# Build TypeScript plugin to dist/
RUN pnpm build

# Copy frontend build output
COPY --from=frontend-build /frontend/dist /app/frontend/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000 8080

ENV NODE_ENV=production
ENV SERVER_PORT=3000
ENV FRONTEND_PORT=8080

CMD ["pnpm", "start"]
