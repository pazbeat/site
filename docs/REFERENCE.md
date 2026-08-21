# Справочник проекта Imbir Thai Spa

Где что лежит, кто владелец, какая переменная за что отвечает.

> **В этом файле нет и не должно быть паролей, ключей и токенов.**
> Файл отслеживается гитом и лежит на GitHub — всё, что сюда попадёт,
> станет публичным. Сами значения секретов живут только в двух местах:
> локальный `.env` (в `.gitignore`) и `.env.production` на сервере.
> Личные пароли — в менеджере паролей, не в репозитории.

## Репозиторий и стенды

| Что | Где |
|---|---|
| Код | https://github.com/pazbeat/site.git |
| Основная ветка | `main`, текущая рабочая — `redesign` |
| Боевой стенд | https://new.imbir.kz (hoster.kz, Астана, 185.129.51.231) |
| Что на сервере | Docker Compose (app + db + backup), nginx, Let's Encrypt, за Cloudflare |
| Каталог | `/opt/imbir/site`, окружение — `.env.production` рядом |
| Деплой | `git pull` + `docker compose --env-file .env.production up -d --build` |
| Локальная БД | Docker-контейнер `imbir-pg` (postgres:16-alpine) |

**Внимание:** на стенде включён боевой Resend — заказы, созданные там, шлют
настоящие письма. Ссылку широко не раздавать.

## Переменные окружения

Значения — в `.env` локально и в `.env.production` на сервере. Здесь только
назначение.

### Обязательные
- `DATABASE_URL` — подключение к PostgreSQL
- `AUTH_SECRET` — подпись сессий Auth.js
- `AUTH_URL` — публичный адрес для Auth.js. **За обратным прокси обязателен:**
  без него библиотека определяет адрес сама и ошибается на `localhost:3000` —
  туда же уводит после входа. Обычно совпадает с `SITE_URL`
- `AUTH_TRUST_HOST=true` — доверять заголовкам прокси
- `CODE_ENCRYPTION_KEY` — AES-GCM для TOTP-секретов и кодов сертификатов
- `SITE_URL` — публичный адрес, используется в письмах и ссылках

### Почта (Resend)
- `RESEND_API_KEY`, `MAIL_FROM`, `MANAGER_EMAIL`
- Домен `imbir.kz` верифицирован, владелец аккаунта — izecreamchik@gmail.com

### WhatsApp
Убран: доставка сертификата идёт только на email, интеграция ChatApp удалена.

### Платежи
- Kaspi, основной способ — ссылка на форму сервиса: `KASPI_PAY_LINK_SLUG`,
  `KASPI_PAY_SERVICE_ID`, `KASPI_PAY_ORDER_FIELD_ID`. Значения читаются прямо
  из ссылки в кабинете Kaspi: `kaspi.kz/pay/{SLUG}?service_id={ID}&{ПОЛЕ}=…`
- Kaspi через PayQR (запасной путь и источник статуса): `KASPI_PAY_MERCHANT_ID`,
  `KASPI_PAY_TERMINAL`. На сервере закомментированы — API шлюза не отвечает
- ForteBank: `FORTE_USERNAME`, `FORTE_PASSWORD`, `FORTE_API_URL`. Пока пары
  логин/пароль нет, кнопка «оплата картой» в конструкторе не показывается
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

**Против базы стенда** (порт наружу не опубликован) — изнутри контейнера
приложения, там же лежат и скрипты, и `tsx`:

```bash
ssh root@185.129.51.231 'cd /opt/imbir/site && docker compose --env-file .env.production exec -T app node_modules/.bin/tsx scripts/apply-test-100.ts'
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

- боевые — из `.env.production` на сервере (`/opt/imbir/site`);
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
