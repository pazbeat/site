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

COPY --chown=nextjs:nodejs --from=proddeps /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs --from=builder /app/.next ./.next
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/lib/generated ./lib/generated
# Шрифты PDF (читаются через fs в рантайме), исходники (RSC/серверный код),
# конфиги и миграции для migrate deploy на старте
COPY --chown=nextjs:nodejs --from=builder /app/assets ./assets
COPY --chown=nextjs:nodejs --from=builder /app/app ./app
COPY --chown=nextjs:nodejs --from=builder /app/components ./components
COPY --chown=nextjs:nodejs --from=builder /app/lib ./lib
COPY --chown=nextjs:nodejs --from=builder /app/i18n ./i18n
COPY --chown=nextjs:nodejs --from=builder /app/messages ./messages
COPY --chown=nextjs:nodejs --from=builder /app/prisma ./prisma
COPY --chown=nextjs:nodejs --from=builder /app/types ./types
COPY --chown=nextjs:nodejs --from=builder /app/proxy.ts ./proxy.ts
COPY --chown=nextjs:nodejs --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY --chown=nextjs:nodejs --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=nextjs:nodejs --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=nextjs:nodejs --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --chown=nextjs:nodejs --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=nextjs:nodejs --from=builder /app/package.json ./package.json
# Скрипты обслуживания: создание администратора, разовые правки справочников.
# Без них в готовом контейнере невозможно завести вход в админку.
COPY --chown=nextjs:nodejs --from=builder /app/scripts ./scripts
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
# Нормализуем переносы строк: репозиторий чекаутится на Windows с CRLF,
# из-за чего шебанг `#!/bin/sh\r` ломает запуск («No such file or directory»)
# Владелец проставляется прямо при копировании: рекурсивный chown в конце
# копировал все 3.5 ГБ в отдельный слой — образ пух вдвое, а сборка на
# сервере уходила в минуты простоя.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
