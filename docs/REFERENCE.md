# Справочник проекта Imbir Thai Spa

Где что лежит, кто владелец, какая переменная за что отвечает.

> **В этом файле нет и не должно быть паролей, ключей и токенов.**
> Файл отслеживается гитом и лежит на GitHub — всё, что сюда попадёт,
> станет публичным. Сами значения секретов живут только в двух местах:
> локальный `.env` (в `.gitignore`) и переменные окружения Railway.
> Личные пароли — в менеджере паролей, не в репозитории.

## Репозиторий и стенды

| Что | Где |
|---|---|
| Код | https://github.com/pazbeat/site.git |
| Основная ветка | `main`, текущая рабочая — `redesign` |
| Тестовый стенд | https://imbir-production.up.railway.app |
| Railway проект | `imbir-preview`, id `49506c4d-b945-46ff-983f-7f04e55fe321` |
| Сервисы Railway | `imbir` (приложение), `Postgres` (база) |
| Деплой | `railway up --detach` из корня проекта |
| Локальная БД | Docker-контейнер `imbir-pg` (postgres:16-alpine) |

**Внимание:** на стенде включены боевые Resend и ChatApp — заказы, созданные
там, шлют настоящие письма и сообщения в WhatsApp. Ссылку широко не раздавать.

## Переменные окружения

Значения — в `.env` локально и в Railway (`railway variables`). Здесь только
назначение.

### Обязательные
- `DATABASE_URL` — подключение к PostgreSQL
- `AUTH_SECRET` — подпись сессий Auth.js
- `CODE_ENCRYPTION_KEY` — AES-GCM для TOTP-секретов и кодов сертификатов
- `SITE_URL` — публичный адрес, используется в письмах и ссылках

### Почта (Resend)
- `RESEND_API_KEY`, `MAIL_FROM`, `MANAGER_EMAIL`
- Домен `imbir.kz` верифицирован, владелец аккаунта — izecreamchik@gmail.com

### WhatsApp (ChatApp, chatapp.online)
- `CHATAPP_EMAIL`, `CHATAPP_PASSWORD`, `CHATAPP_APP_ID`, `CHATAPP_LICENSE_ID`,
  `CHATAPP_MESSENGER`
- `WHATSAPP_MOCK=1` — писать в `.wa-outbox` вместо реальной отправки

### Платежи
- Kaspi через PayQR: `KASPI_PAY_MERCHANT_ID`, `KASPI_PAY_TERMINAL`
- ForteBank: `FORTE_USERNAME`, `FORTE_PASSWORD`, `FORTE_API_URL`
- `PAYMENT_MOCK=1` — демо-провайдер, **в проде не включать**

### Altegio (CRM)
- `ALTEGIO_PARTNER_TOKEN`, `ALTEGIO_USER_TOKEN`, `ALTEGIO_CHAIN_ID`,
  `ALTEGIO_TEST`, `ALTEGIO_SYNC`
- Учётка для получения свежего `user_token` — **в менеджере паролей**,
  в репозитории её быть не должно
- `ALTEGIO_TEST=1` — тестовый режим, записи помечаются `[ТЕСТ]`

### Прочее
- `SENTRY_DSN` — без неё мониторинг выключен (no-op)
- `PREVIEW_NO_2FA` — только для стенда, снимает обязательный TOTP
- `RUN_SEED` — прогнать сид при старте (на непустой БД — no-op)

## Админка

- Адрес: `/admin`, вне i18n-маршрутов
- Создание админа: `npx tsx scripts/create-admin.ts <email> <pass> [superadmin|manager]`
  — печатает QR для приложения-аутентификатора
- TOTP обязателен (кроме стенда с `PREVIEW_NO_2FA`)

## Разовые скрипты обслуживания

Лежат в `scripts/`, запускаются через `npx tsx`:

- `apply-program-photos.ts` — проставить `photoUrl` программам без картинки
  (сид на непустой БД — no-op, см. `prisma/seed.ts:92`)
- `create-admin.ts` — создать администратора
- `add-region-salons.ts`, `apply-price-2026-07.ts`, `apply-designs.ts` — правки
  справочных данных

**Против базы стенда** (она во внутренней сети Railway, снаружи недоступна) —
через публичный прокси Postgres:

```bash
railway run --service Postgres node -e "const {execSync}=require('child_process'); execSync('npx tsx scripts/apply-program-photos.ts',{stdio:'inherit',env:{...process.env,DATABASE_URL:process.env.DATABASE_PUBLIC_URL}})"
```

## Как продолжить работу с другого компьютера

В репозитории лежит всё, что нужно, чтобы поднять проект с нуля. Кроме двух
вещей, которые в гит намеренно не попадают: **секретов** и **содержимого базы**.

```bash
git clone https://github.com/pazbeat/site.git
cd site
git checkout redesign        # вся текущая работа здесь, main отстаёт
npm ci
cp .env.example .env         # заполнить значениями (см. ниже, откуда брать)
docker run -d --name imbir-pg -p 5432:5432 \
  -e POSTGRES_USER=imbir -e POSTGRES_PASSWORD=imbir -e POSTGRES_DB=imbir \
  postgres:16-alpine
npx prisma migrate deploy
npx prisma db seed           # справочники: программы, номиналы, филиалы
npx tsx scripts/create-admin.ts <email> <пароль> superadmin
npm run dev
```

**Откуда брать значения для `.env`:**

- боевые — из переменных стенда: `railway variables` (нужен `railway login`);
- либо из менеджера паролей владельца;
- для локальной разработки многое можно не заполнять: без ключей Resend и
  ChatApp письма и сообщения пишутся в `.mail-outbox/` и `.wa-outbox/`,
  а `PAYMENT_MOCK=1` включает демо-оплату.

**Чего не будет после чистой установки:** заказов, выпущенных сертификатов,
правовых текстов, правок справочников через админку. Сид создаёт только
базовый набор (20 программ), тогда как в рабочих базах программ больше —
часть добавлялась скриптами `scripts/apply-*.ts` и через админку. Если нужна
копия боевых данных — снимать дамп через панель бэкапов в админке или
`scripts/backup-db.sh`.

## Полезные ссылки

- ТЗ: [prd.md](prd.md)
- Чек-лист безопасности: [SECURITY.md](SECURITY.md)
- Деплой: [DEPLOY.md](DEPLOY.md)
- Правила для агентов и архитектурные решения: [../AGENTS.md](../AGENTS.md)
