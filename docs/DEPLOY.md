# Деплой (Фаза 1)

Стек: `docker-compose.yml` — **app** (Next.js) + **db** (PostgreSQL 16) + **backup** (ежедневный pg_dump). HTTPS терминируется внешним reverse-proxy (Caddy/nginx/Traefik) перед app — сам контейнер слушает `127.0.0.1:3000`.

## Требования на сервере
- Docker + Docker Compose v2.
- Reverse-proxy с TLS-сертификатом (Let's Encrypt), проксирующий `https://sert.imbir.kz` → `127.0.0.1:3000`.

## Шаги

1. **Клонировать репозиторий** и подготовить env:
   ```bash
   cp .env.production.example .env.production
   ```
   Заполнить `.env.production`. Сгенерировать секреты:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # AUTH_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # CODE_ENCRYPTION_KEY
   ```
   Задать сильный `POSTGRES_PASSWORD`, реальные ключи Kaspi/Freedom/Resend, `SITE_URL=https://sert.imbir.kz`.

2. **Первый запуск с сидом справочников** (27 программ, 4 номинала, 7 филиалов, правовые плейсхолдеры):
   ```bash
   RUN_SEED=1 docker compose --env-file .env.production up -d --build
   ```
   Миграции применяются автоматически (`docker-entrypoint.sh` → `prisma migrate deploy`).
   После первого старта вернуть `RUN_SEED=0` в env (сид идемпотентен, но незачем).

3. **Создать администратора** (2FA обязательна в production):
   ```bash
   docker compose exec app npx tsx scripts/create-admin.ts admin@imbir.kz "СИЛЬНЫЙ-ПАРОЛЬ" superadmin
   ```
   Отсканировать напечатанный QR приложением-аутентификатором.

4. **Проверить**: `https://sert.imbir.kz` открывается, `/admin/login` требует вход, security-заголовки на месте (CSP с nonce, HSTS).

## Обновление версии
```bash
git pull
docker compose --env-file .env.production up -d --build   # миграции применятся на старте
```

## Бэкапы
Сервис `backup` пишет `imbir-<timestamp>.sql.gz` в volume `backups` раз в сутки, ротация 30 дней (PRD §9.12). Проверить/восстановить:
```bash
docker compose exec backup ls -lh /backups
# восстановление:
gunzip -c /backups/imbir-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U imbir -d imbir
```
Рекомендуется дополнительно выгружать volume `backups` на внешнее хранилище (S3/rsync).

## Проверено локально
Образ собран (`docker build`), контейнер поднят против PostgreSQL: `migrate deploy` отработал, Next стартовал, `GET /ru` и `/kk` → 200, production-CSP с nonce + HSTS присутствуют, `/admin/orders` без сессии → 307 на login.

## Открытые задачи эксплуатации
- Подключить Sentry (`SENTRY_DSN`) со scrubbing ПД.
- Прогнать OWASP ZAP baseline (PRD §9.14).
- Настроить внешнюю выгрузку бэкапов.
- Убедиться, что в `.env.production` НЕТ `PAYMENT_MOCK` и `ADMIN_2FA_DISABLED`.

Альтернатива Docker — **Vercel + управляемый PostgreSQL** (Neon/Supabase): задать те же env в проекте Vercel, `prisma migrate deploy` в build-команде, cron бэкапов — средствами провайдера БД. pg-boss требует постоянно живого процесса, поэтому на Vercel очереди выносятся в отдельный worker (или на Docker-хост).
