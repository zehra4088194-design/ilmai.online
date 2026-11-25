# ---- Ilm AI (Next.js standalone) – built for Coolify on Oracle ARM/x86 ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Coolify build variables: NEXT_PUBLIC_* values are inlined into the browser bundle.
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_SITE_URL=https://ilmai.online
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
ARG NEXT_PUBLIC_PADDLE_ENVIRONMENT=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_CLIENT_TOKEN \
    NEXT_PUBLIC_PADDLE_ENVIRONMENT=$NEXT_PUBLIC_PADDLE_ENVIRONMENT \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Blank placeholders only. Set actual values in Coolify (never bake secrets into image).
ENV SUPABASE_SERVICE_ROLE_KEY="" \
    OPENROUTER_API_KEY="" \
    ADMIN_EMAILS="ilmai.store2@gmail.com" \
    CRON_SECRET="" \
    EXCHANGE_RATE_API_KEY="" \
    AI_ROUTER_URL="" \
    AI_ROUTER_SECRET="" \
    E2B_API_KEY="" \
    PDF_RENDERER_URL="" \
    PDF_RENDERER_SECRET="" \
    RESEND_API_KEY="" \
    EMAIL_FROM="Ilm AI <contact@ilmai.online>" \
    B2_ENDPOINT="" \
    B2_REGION="" \
    B2_KEY_ID="" \
    B2_APPLICATION_KEY="" \
    B2_BUCKET="" \
    PADDLE_API_KEY="" \
    PADDLE_WEBHOOK_SECRET="" \
    PADDLE_ENVIRONMENT="" \
    PAYPRO_MERCHANT_NO="" \
    PAYPRO_APP_SECRET="" \
    PAYPRO_API_BASE_URL="" \
    PAYPRO_NOTIFY_URL="" \
    LEGAL_ENTITY_NAME="" \
    SUPPORT_EMAIL="contact@ilmai.online" \
    FEEDBACK_EMAIL="feedback@ilmai.online" \
    PRIVACY_CONTACT_EMAIL="contact@ilmai.online" \
    LEGAL_POSTAL_ADDRESS="" \
    LEGAL_GOVERNING_LAW="" \
    LEGAL_DATA_REGIONS=""
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
