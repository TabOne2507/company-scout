# ── Build Stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
 
WORKDIR /app
 
# Install dependencies only when needed
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
 
# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
 
WORKDIR /app
 
# Security: non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
 
# Copy only production files
COPY --from=base /app/node_modules ./node_modules
COPY --chown=appuser:nodejs . .
 
USER appuser
 
ENV NODE_ENV=production
ENV PORT=3000
 
EXPOSE 3000
 
# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
 
CMD ["node", "server.js"]
