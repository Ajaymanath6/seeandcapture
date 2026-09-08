# syntax=docker/dockerfile:1.7

FROM node:20.11-alpine3.19 AS deps
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:20.11-alpine3.19 AS runner
WORKDIR /app

RUN addgroup -S appuser && adduser -S -G appuser appuser

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appuser server/package.json ./
COPY --chown=appuser:appuser server/server.js ./
COPY --chown=appuser:appuser server/prompts.js ./
COPY --chown=appuser:appuser server/providers ./providers

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

USER appuser
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
