<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Imbir Thai Spa — сайт подарочных сертификатов

Полное ТЗ: [docs/prd.md](docs/prd.md). Прототип UI: [docs/prototype.html](docs/prototype.html) (референс структуры/функциональности, но палитра там устаревшая — красить строго по брендбуку). Брендбук: docs/brandbook.pdf.pdf.

## Стек (зафиксировано в PRD §2)

- **Next.js 15+ (App Router, TypeScript, RSC)** — фронт и бэк в одном репозитории, SSR для SEO.
- **PostgreSQL 16 + Prisma** — только миграции, никакого raw SQL без параметризации.
- **Tailwind CSS + shadcn/ui**, токены брендбука в конфиге Tailwind.
- **next-intl**: RU (default) / KK / EN, маршруты `/ru /kk /en`.
- **Auth.js (NextAuth v5)** для админки: credentials + обязательный TOTP 2FA, argon2id.
- **pg-boss** (очереди поверх Postgres): отложенная доставка, ретраи вебхуков, синк Altegio.
- **Zod** на каждом API-входе (сервер обязательно). Vitest (unit) + Playwright (e2e).
- Платежи: Kaspi Pay + Freedom Pay за общим интерфейсом `PaymentProvider`.
- Email: Resend; WhatsApp: **ChatApp** (chatapp.online) за интерфейсом `MessagingProvider`.

## Дизайн-токены (брендбук, PRD §3) — СТРОГО

| Токен | HEX | Использование |
|---|---|---|
| `brand-purple` | `#4D295D` | основной: hero/футер, заголовки, кнопки |
| `brand-gold` | `#B69244` (градиент с `#B59243`) | акценты, рамки, цены, hover |
| `brand-red` | `#CF0000` | ТОЛЬКО ошибки/предупреждения/бейджи скидок, не декоративно |
| белый `#FFFFFF` | | основной фон, текст на фиолетовом |

- Заголовки: **Cormorant Garamond** (Google Fonts, кириллица). Текст: **Montserrat** — принятая замена коммерческого Coco Gothic до подтверждения веб-лицензии (открытый вопрос №2). Загрузка через `next/font`.
- Производные оттенки — только затемнение/осветление фирменных цветов. Допустим градиент фиолетовый→золото.
- Тонкие золотые рамки 1px на карточках сертификатов; line-art имбиря (SVG-заглушки до получения исходников).
- Премиальный «воздушный» стиль, адаптивность от 360px, уважать `prefers-reduced-motion`.

## Ключевые архитектурные решения

- **Цена — только из БД на сервере**; клиентские цены — отображение, не источник истины.
- **Код сертификата** `IMB-XXXX-XXXX`: crypto.randomBytes, энтропия ≥ 40 бит, алфавит без O/0/I/1. В БД хранится **SHA-256 хэш** (`code_hash`), открытый код показывается один раз + в PDF. Поиск — по хэшу.
- **Consent-модалка обязательна** до конструктора и на шаге оплаты; без записи согласия (`consent`: версии документов, IP, UA, timestamp) заказ не создаётся. Плейсхолдер текста: «Привет, ты точно хочешь купить?».
- **Правовые документы версионируются**: каждое сохранение — новая неизменяемая версия; согласия ссылаются на конкретные версии.
- **Выбор города → филиала обязателен** на первом шаге конструктора; филиал фильтрует программы (часть SPA только Астана/Алматы), сохраняется в заказе, определяет `location_id` Altegio.
- Деньги — **integer, целые тенге** (тиынов нет).
- **Серийный номер сертификата** (`Certificate.serial`, напр. WM001): внутренний, по салону — префикс `Salon.codePrefix` (WM/WT/WB/WR/WN/WP/WK; WS Семей — салон ещё не заведён) + атомарный счётчик `Salon.lastCertSerial`, паддинг 3 цифры. Для админки и Altegio; покупателю НЕ показывается — публичный код только случайный IMB-…. Генерится в `fulfillOrder`.
- **Промокоды (Фаза 2)**: скидка уменьшает СУММУ ОПЛАТЫ (`order.amountKzt`), а номинал сертификата (`item.amountKzt` → баланс получателя) остаётся полным. Скидка считается только на сервере (`lib/promo.ts`); клиентское превью — через `/api/promo/validate`. Ценообразование заказа вынесено в общий `lib/pricing.ts` (`resolveOrderAmount`), используется и заказом, и превью промо. Коды хранятся в верхнем регистре; `Promo.limits` (Json): `{maxUses, validFrom, validUntil, minAmountKzt}`. Невалидный промокод не блокирует заказ — просто без скидки. maxUses считается по оплаченным заказам (soft-gate).
- Вебхуки платежей: проверка подписи, идемпотентность, сверка суммы с заказом на сервере. Неоплаченные заказы протухают через 30 минут.
- **Отложенная доставка (Фаза 2)**: sweeper-модель. Будущий `scheduledAt` НЕ пред-планируется в pg-boss — `enqueueDelivery` для будущей даты ничего не делает, а cron `deliver-scheduled` (каждые 5 мин, `lib/scheduled.ts`) находит наступившие (`scheduledAt<=now, sentAt=null`) и ставит немедленную доставку. Так перенос/«отправить сейчас» из `/admin/scheduled` — просто правка `scheduledAt`, переживает рестарты; идемпотентность — `sentAt`.
- **WhatsApp-доставка (Фаза 2, ChatApp)**: `lib/messaging/` за интерфейсом `MessagingProvider` (sendText/sendFile). Адаптер `chatapp.ts`: токен через `POST /v1/tokens` (email+password+appId, кэш 23ч, ре-авторизация на 401) → `POST /v1/licenses/{licenseId}/messengers/{type}/chats/{phone}@c.us/messages/text|messages/file`. **Пути выверены по живому API (2026-07-13): суффикс `messages/text` и `messages/file` (через слэш!), НЕ `messages-text`/`messages-file` — те дают 404 и раньше молча ломали доставку.** Текст: body `{text}`. **Файл: body `{file: ПУБЛИЧНЫЙ_URL, fileName, text}` — ChatApp сам качает файл по URL (multipart/бинарь НЕ поддерживается); на localhost URL недоступен извне → доставка файла best-effort (падает), но текст со ссылкой на `/success?token=…` доходит, а по ссылке юзер качает PDF.** **messengerType для «[WEB] WhatsApp» = `grWhatsApp`** (не `whatsapp`); `licenseId` (напр. 45740) ≠ число из appId — узнавать через `GET /v1/licenses`; список чатов `GET …/chats`. Мок `.wa-outbox` при `WHATSAPP_MOCK=1` или без секретов. Телефон→chatId: цифры, ведущая 8→7, `@c.us`.
- **Напоминания об истечении (Фаза 2)**: cron `expiry-reminders` (раз в сутки 09:00 Almaty) → `lib/reminders.ts`. Вехи 30/7 дней, каждая шлётся один раз (`Certificate.reminder30SentAt`/`reminder7SentAt`), 7-дневная приоритетнее. Письмо держателю (email-доставка → контакт получателя, иначе — покупателю). Чистая `dueReminderMilestone` — тестируется.
- **Altegio (Фаза 3)**: наша БД — источник истины по выпуску, Altegio — по погашениям. Все вызовы через очередь (лимит 200 req/min), ошибка синка не блокирует доставку. Наш код IMB-… передаётся кодом сертификата в Altegio. Реализация: `lib/altegio/` — `client.ts` (авторизация двумя токенами: заголовок `Authorization: Bearer {partnerToken}, User {userToken}` + `Accept: application/vnd.api.v2+json`, база `https://api.alteg.io/api/v1`), `mapping.ts` (префикс салона→company_id, выверено живьём), `sync.ts` (`syncCertificateToAltegio` — best-effort из `fulfillOrder`, TEST-режим `[ТЕСТ]` в комментарии), `operations.ts` (выпуск сертификата). **Выверено живьём (2026-07-13/14):** `GET companies?my=1` (14 филиалов сети «Имбирь Thai Spa», chainId **205715**), `GET chain/{chainId}/loyalty/certificate_types` (250 шаблонов). **ВЫПУСК сертификата = продажа товара-сертификата через storage-операцию** (эндпоинт из рабочего Node-RED заказчика, база **app.alteg.io**, НЕ api.alteg.io): `POST https://app.alteg.io/api/v1/storage_operations/operation/{company_id}` — большой документ «Product sale» с одной goods-транзакцией; наш публичный код IMB-… кладётся в `goods_transactions[0].good_special_number` (номер сертификата, УНИКАЛЕН — повтор даёт 400 «Gift card with such number already exists», трактуем как идемпотентный успех). **КРИТИЧНО (выяснено 2026-07-14 при отладке «в Altegio ничего не появляется»):** сертификат в CRM создаётся только при выполнении ДВУХ условий — (1) продаётся РЕАЛЬНЫЙ товар-сертификат (у товара есть `loyalty_certificate_type_id`); тест-товар «Тестовый 1тенге» сертификат НЕ создаёт, только складское списание, невидимое в CRM; (2) привязан КЛИЕНТ (`client_id`) — список сертификатов в Altegio ищется по телефону клиента (`GET loyalty/certificates/?company_id={c}&phone={phone}`), без клиента запись не видна нигде. Ещё: **баланс берётся из ТИПА товара** (`loyalty_certificate_type.balance`), а не из нашей суммы → для каждого номинала нужен свой товар-сертификат. Клиент: `POST company/{c}/clients/search` (quick_search) или `POST clients/{c}`. **TEST-режим** продаёт реальный товар «Энергия Сиама Сайт 35000» (`good_id 24847459`, cert_type 286962, баланс 35000) на филиале 225022 (Мангилик), storage 424028, master 1004429, account 430646, и вешает на служебного тест-клиента «[ТЕСТ] Сайт Imbir» (тел `77000000199`); товар грузится живьём через `fetchGood`. Записи помечены `[ТЕСТ]`, реальный погашаемый сертификат появляется под этим клиентом. Выверено e2e живьём: мок-покупка → `fulfillOrder` → сертификат `IMB-8M68-SHCR` виден в `loyalty/certificates` по телефону тест-клиента, balance 35000, active. Боевая запись за флагом `ALTEGIO_SYNC=1`. **TODO для прода:** маппинг каждого номинала/программы → свой товар-сертификат Altegio по филиалам + привязка реального покупателя как клиента (нужны per-branch good_id/storage/master/account). Env: `ALTEGIO_PARTNER_TOKEN`, `ALTEGIO_USER_TOKEN`, `ALTEGIO_CHAIN_ID=205715`, `ALTEGIO_TEST=1`, `ALTEGIO_SYNC=1`. Логин Node Auth (для свежего user_token): телефон 77782761255 / пароль 101010.
- Таймзона доставки: **Asia/Almaty**.
- Статусы сертификата: `active → partially_used → used / expired / refunded / blocked` (partially_used — для номинальных).
- Деактивация программ вместо удаления, если есть проданные сертификаты.

## Безопасность (PRD §9 — каждый пункт acceptance criterion)

CSP без unsafe-inline для скриптов + HSTS и пр. заголовки; `dangerouslySetInnerHTML` только для санитизированных (sanitize-html, allowlist) правовых текстов; middleware закрывает все `/admin/*` и `/api/admin/*` на сервере; rate limit на все публичные POST и `/check` (5/мин на IP); загрузка файлов — магические байты, sharp → WebP, случайные имена; секреты только в env; не логировать ПД и коды в plaintext.

## Фазы (PRD §10)

1. **MVP**: каркас (Next+Prisma+i18n+токены) → публичный сайт → оплата → PDF+QR+email → админка → чек-лист безопасности → деплой.
2. WhatsApp, отложенная отправка, промокоды, корпоративные заявки, дашборд, напоминания.
3. Altegio, KK/EN правовые тексты, A/B цен.

**Каждая фаза завершается: `npm run build` без ошибок + все тесты зелёные.**

## Особенности установленного стека (важно!)

- **Next 16.2** (не 15): файл `middleware.ts` переименован в **`proxy.ts`** (экспорт `proxy`), документация — в `node_modules/next/dist/docs/`.
- **Prisma 7**: `url` в `datasource` схемы запрещён — подключение задаётся в `prisma.config.ts` (`datasource.url`) и через адаптер `@prisma/adapter-pg` в конструкторе `PrismaClient`. Генератор — `prisma-client` с output в `lib/generated/prisma` (в .gitignore). Ключ `"prisma"` в package.json не поддерживается — сид настроен в `prisma.config.ts`.
- **Tailwind v4**: токены объявлены в `@theme` в `app/globals.css`, файла tailwind.config нет.
- Первая миграция сгенерирована офлайн (`prisma/migrations/20260709000000_init`) — при первом подключении БД выполнить `npx prisma migrate deploy` (или `migrate dev` для дальнейшей разработки).
- **Оплата**: `PAYMENT_MOCK=1` в `.env` включает демо-провайдера (страница `/pay/mock` шлёт подписанный вебхук) — для dev/e2e; в production не включать. **Kaspi Pay через шлюз PayQR (payqr.kz), боевой, без вебхуков**: `lib/payments/kaspi.ts` — `createInvoice` (`POST /v1/le/qr_invoice` c `machid`+`terNumber`+`orderid`(UUID)+`name`+`price` в тиынах строкой `${kzt}00`) возвращает `twocode` (ссылка `kaspi.kz/pay/PayQR`); `checkStatus` (`POST /v1/le/pay_status` `{orderid,machid}`, `code/status.code==="1"`→оплачено, `"2"`→ждём). createPayment не редиректит на внешний сайт, а на нашу `/{locale}/pay/kaspi?order=…`; страница создаёт инвойс (`/api/payments/kaspi/invoice`, QR из twocode) и опрашивает `/api/payments/kaspi/status` (при оплате → `fulfillOrder`, редирект на `/success`). Вебхуков нет → опрос клиентом (страница открыта). **TODO до боевого запуска: фоновый поллер pending-kaspi-заказов** — иначе оплата при закрытой странице не исполнится. Freedom Pay — каркас. Локальная БД — Docker-контейнер `imbir-pg` (postgres:16-alpine, user/pass/db: imbir). pg-boss стартует через `instrumentation.ts` (cron `expire-orders` каждые 5 мин).
- **Безопасность**: CSP с per-request nonce + security-заголовки навешиваются в `proxy.ts` (`lib/security.ts`); в dev послабления для Turbopack HMR (unsafe-eval/inline), в production строго (`script-src 'self' 'nonce-…' 'strict-dynamic'`). next-intl копирует заголовки запроса в rewrite, поэтому nonce (в заголовке `content-security-policy` запроса) доходит до Next и проставляется скриптам. Чек-лист §9 — `docs/SECURITY.md`. Бэкапы — `scripts/backup-db.sh` (cron). `npm audit`: транзитивный postcss-advisory внутри Next не эксплуатируется (не форсить fix — откатит Next до v9).
- **Админка** (`/admin/*`, вне i18n): Auth.js v5 — конфиг разделён на `lib/auth.config.ts` (edge-safe, для `proxy.ts`) и `lib/auth.ts` (Credentials + argon2 + prisma, только Node). `proxy.ts` закрывает `/admin/*` (редирект на login) и `/api/admin/*` (401). Создание админа: `npx tsx scripts/create-admin.ts <email> <pass> [superadmin|manager]` — печатает TOTP QR. **otplib v13**: `generateSecret`/`generateURI({issuer,label,secret})`/`verifySync({token,secret}).valid` (нет `authenticator`). TOTP-секрет и код сертификата шифруются AES-GCM (`lib/crypto.ts`, `CODE_ENCRYPTION_KEY`). Мутации пишут `auditLog`. Правовые тексты — sanitize-html на сервере, каждая правка = новая неизменяемая `LegalVersion`. Варианты программы редактируются по `id` (обновление на месте; удаление только без проданных сертификатов).

## Команды

- `npm run dev` / `npm run build` / `npm test` (Vitest) / `npm run test:e2e` (Playwright)
- `npx prisma migrate dev` — миграции (нужен PostgreSQL, `DATABASE_URL` в `.env`)
- `npx prisma db seed` — сид: 27 программ, 4 номинала, 7 филиалов (данные — PRD Приложение А)

## Открытые вопросы бизнеса (PRD §12, не блокируют Фазу 1)

Altegio-токены и location_id; лицензия Coco Gothic; SVG логотипа/line-art; реальные правовые тексты; провайдер WhatsApp; тип договора Kaspi Pay + тестовая среда; юридический срок действия сертификата.
