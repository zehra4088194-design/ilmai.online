FROM node:22-bookworm-slim

ENV NODE_ENV=production PORT=3400 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-noto-extra \
 && rm -rf /var/lib/apt/lists/*

COPY workers/pdf-renderer/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npx playwright install --with-deps chromium \
 && fc-cache -f \
 && chown -R node:node /app /ms-playwright

COPY --chown=node:node workers/pdf-renderer/server.js ./
USER node
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3400/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
