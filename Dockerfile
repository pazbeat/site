# syntax=docker/dockerfile:1
# Multi-stage сборка Next.js для production (классический `next start`).

FROM node:22-alpine AS base
# libc6-compat нужен нативным модулям (@node-rs/argon2, prisma engines)
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps: полная установка для сборки ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: prisma generate + next build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Клиент Prisma в lib/generated/prisma (в .gitignore — генерируем)
RUN npx prisma generate && npm run build

# ---------- prod-deps: только runtime-зависимости ----------
FROM base AS proddeps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Клиент Prisma не переустанавливается npm — переносим из builder
COPY --from=builder /app/lib/generated ./lib/generated

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
# postgresql16-client + tar — pg_dump/pg_restore для панели бэкапов (/admin/backup)
RUN apk add --no-cache postgresql16-client tar \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/generated ./lib/generated
# Шрифты PDF (читаются через fs в рантайме), исходники (RSC/серверный код),
# конфиги и миграции для migrate deploy на старте
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/i18n ./i18n
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/types ./types
COPY --from=builder /app/proxy.ts ./proxy.ts
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
