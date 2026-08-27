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

Переносится тремя частями. Код едет сам, остальное — руками.

### 1. Код и вся история решений — из гита

```bash
git clone https://github.com/pazbeat/site.git
cd site
git checkout redesign        # вся текущая работа здесь, main отстаёт
npm ci
```

Вместе с кодом приезжают [STATUS.md](STATUS.md) — на чём остановились,
[AGENTS.md](../AGENTS.md) — архитектурные решения и что выверено живьём,
[KASPI-BRIDGE.md](KASPI-BRIDGE.md) — договорённость со старым сайтом. Этого
достаточно, чтобы новая сессия поняла состояние проекта без истории переписки.

### 2. Секреты — папкой `secrets/`

Её нет в гите (и не должно быть). Перенести защищённым способом — менеджером
паролей, зашифрованным архивом, флешкой:

| Файл | Что это |
|---|---|
| `env-local.txt` | содержимое `.env` для локальной разработки |
| `env-production.txt` | содержимое `.env.production` с боевого сервера |
| `imbir_deploy` | ключ SSH к серверу 185.129.51.231 |
| `apple-wallet-pass.crt/.key` | сертификат Apple Wallet (просрочен) |

На новой машине:

```bash
cp secrets/env-local.txt .env
mkdir -p ~/.ssh && cp secrets/imbir_deploy ~/.ssh/ && chmod 600 ~/.ssh/imbir_deploy
```

### 3. База — дампом

Свежий дамп лежит на сервере в томе `site_backups` и локально в
`Documents/sert-backups`. Для локальной разработки обычно достаточно базы
с нуля:

```bash
docker run -d --name imbir-pg -p 5432:5432 -e POSTGRES_USER=imbir -e POSTGRES_PASSWORD=imbir -e POSTGRES_DB=imbir postgres:16-alpine
npx prisma migrate deploy
npx prisma db seed
npx tsx scripts/create-admin.ts <email> <пароль> superadmin
npm run dev
```

Нужны боевые данные — развернуть дамп вместо сида:

```bash
zcat imbir-*.sql.gz | docker exec -i imbir-pg psql -U imbir -d imbir
```

### Что НЕ переносится автоматически

**Переписка с Claude Code хранится локально**, на серверы не уезжает. Файлы
лежат в `~/.claude/projects/C--Users-asus-Documents-sert/` — это и история
сессий (`*.jsonl`, около 180 МБ), и долговременная память (`memory/`).

Скопировать можно, но **имя папки выводится из пути к проекту**: она подойдёт,
только если на новой машине проект лежит ровно по тому же пути. Иначе папку
надо переименовать под новый путь (разделители пути заменяются дефисами).

Практический вывод: на перенос переписки не рассчитывать. Всё, что должно
пережить смену машины, пишется в `STATUS.md` и `AGENTS.md` — именно поэтому
они обновляются после каждого значимого шага.

## Полезные ссылки

- ТЗ: [prd.md](prd.md)
- Чек-лист безопасности: [SECURITY.md](SECURITY.md)
- Деплой: [DEPLOY.md](DEPLOY.md)
- Правила для агентов и архитектурные решения: [../AGENTS.md](../AGENTS.md)

## Уведомления о продажах

Настраиваются в админке (`/admin/settings`), хранятся в `Setting.sale_notifications`.

- **Telegram-бот** — `@newimbirbot` («NewImbir»). Токен только в `.env.production`
  (`TELEGRAM_BOT_TOKEN`), в гит не попадает. Сброс токена — у @BotFather, `/revoke`.
- **Группа** IMBIR OS: `telegramChatId = -1002183916563`, тема NewImbirLog —
  `telegramThreadId = 7171`. Без темы сообщение падает в общую ветку.
- **Почта** — поле `email` в тех же настройках (несколько адресов через запятую);
  пусто — берётся `MANAGER_EMAIL` из окружения.

Как узнать id заново, если группа сменится: добавить бота в группу, написать в
нужной теме `/start@newimbirbot` (у бота включён режим приватности, обычные
сообщения он не видит) и прочитать `getUpdates` — там `chat.id` и
`message_thread_id`.

В уведомление уходит полная карточка продажи и сам PDF сертификата. Карточка
рассчитана влезать в подпись Telegram (1024 знака) — на это есть тест; если
перерастёт, текст уйдёт отдельным сообщением, а файл следом.

## Версия развёрнутой сборки

В подвале сайта, приглушённой строкой рядом с копирайтом: **«Версия 247 ·
27.08.26 11:32»**. Номер — количество коммитов в ветке: растёт только вперёд,
поэтому 248 заведомо свежее 247. Хэш коммита в видимой строке НЕ показываем —
по двум хэшам не понять, какой новее, а вопрос ровно в этом; он лежит во
всплывающей подсказке и в `GET /api/version`.

Приложение одно, фронт и бэк деплоятся вместе, поэтому версия общая.

`.git` в `.dockerignore`, изнутри образа гит не спросить — значения приходят
аргументами сборки. **Деплоить так:**

```
BUILD_NUMBER=$(git rev-list --count HEAD) BUILD_SHA=$(git rev-parse --short HEAD) BUILD_TIME=$(date -u +%FT%TZ)   docker compose --env-file .env.production up -d --build app
```

Забыли аргументы — в подвале будет «dev». Это не поломка, но и не версия:
понять по такому сайту, что на нём выкачено, нельзя.
