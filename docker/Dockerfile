# Stage 1: Build TypeScript to JavaScript
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json tsconfig*.json ./

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci

# Copy source code and build scripts
COPY src/ ./src/
COPY scripts/ ./scripts/

# Compile TypeScript to dist/
RUN npm run build

# Prune devDependencies to keep production layer small
RUN npm prune --omit=dev

# Stage 2: Production runtime
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy runtime manifests, compiled output, and production dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create cache and data directories with proper permissions for the node user
RUN mkdir -p /home/node/.cache/mantisbt-mcp /data && \
    chown -R node:node /home/node /data /app

USER node

# Default HTTP transport port (when TRANSPORT=http)
EXPOSE 3000

CMD ["node", "dist/index.js"]
