# ==============================================================================
# Faculty Flow 2.0 - Production Multi-Stage Dockerfile
# ==============================================================================

# Stage 1: Build Frontend and Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm ci

# Copy full source tree
COPY . .

# Run Typecheck and Build
RUN npm run typecheck
RUN npm run build

# Prune development dependencies for minimal production image
RUN npm prune --omit=dev

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install curl for container health check
RUN apk add --no-cache curl

# Create non-root directory for private uploads
RUN mkdir -p /app/uploads/events && chown -R node:node /app

# Copy pruned node_modules and built bundles
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/client/dist ./client/dist

# Use non-root node user for container security
USER node

EXPOSE 5000

# Healthcheck probe pointing to /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
