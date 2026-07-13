# Чек-лист безопасности (PRD §9)

Статус по каждому пункту acceptance-критерия §9. Отметка ✅ — реализовано и проверено, ⏳ — на этап деплоя/эксплуатации, 🔜 — Фаза 2+.

| # | Требование | Статус | Где |
|---|---|---|---|
| 1 | Инъекции: только Prisma, Zod на всех входах | ✅ | `lib/validation.ts`, все API-роуты `safeParse` |
| 2 | XSS: экранирование React; `dangerouslySetInnerHTML` только для санитизированных правовых текстов; CSP без unsafe-inline для скриптов + заголовки | ✅ | `lib/admin/sanitize.ts`, `proxy.ts` (CSP с per-request nonce + strict-dynamic), `lib/security.ts` |
| 3 | Auth: argon2id, TOTP 2FA, lockout 5/15мин, httpOnly+Secure+SameSite, middleware закрывает `/admin/*` и `/api/admin/*` | ✅ | `lib/auth.ts`, `lib/admin/verify.ts`, `lib/admin/lockout.ts`, `proxy.ts` (2FA off в dev через `ADMIN_2FA_DISABLED`) |
| 4 | CSRF: Server Actions (встроенная защита Next) + Origin у Auth.js | ✅ | мутации админки — Server Actions; Auth.js CSRF-токен |
| 5 | IDOR: проверка роли в админке; публичный API не отдаёт списков, только точечный поиск по полному коду | ✅ | `requireAdmin/requireSuperadmin`, `/api/check` только по полному хэшу |
| 6 | Коды ≥40 бит (crypto), rate limit `/check` и CRM, задержка/alert | ✅ (rate limit) / ⏳ (alert на аномалии) | `lib/certificate-code.ts`, `lib/rate-limit.ts` |
| 7 | Платежи: подпись вебхуков, сверка суммы, идемпотентность, секреты в env | ✅ | `app/api/payments/[provider]/webhook`, `lib/certificates.ts` (fulfillOrder), `.env` |
| 8 | Загрузка файлов: магические байты, лимит, sharp→WebP, случайные имена | 🔜 | загрузка фото программ — Фаза 2 (сейчас фото по URL) |
| 9 | Rate limiting на публичные POST | ✅ | `/api/orders`, `/api/check`, `/api/corporate`, `/api/claim` |
| 10 | Логи/аудит: не логировать ПД и коды; аудит мутаций | ✅ | `auditLog` (только id и бизнес-поля); коды только в хэше/шифртексте |
| 11 | Зависимости: `npm audit` в CI, lockfile | ⏳ CI | см. «Известные уязвимости» ниже |
| 12 | Бэкапы: ежедневный pg_dump, ротация 30 дней, проверка восстановления | ✅ скрипт / ⏳ cron | `scripts/backup-db.sh` |
| 13 | ПД (Закон РК): минимум данных, согласие фиксируется | ✅ | `Order.consent` (версии/IP/UA/ts) |
| 14 | Security e2e: доступ к /admin без сессии, IDOR, невалидные вебхуки; OWASP ZAP | ✅ проверено вручную / ⏳ ZAP | ниже |

## Проверено вживую

- `GET /admin/*` без сессии → 307 на `/admin/login`; `GET /api/admin/*` → 401.
- Вебхук оплаты с неверной подписью → 400, сертификат не создаётся; повторный валидный вебхук идемпотентен (один сертификат).
- Production CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'` (без unsafe-inline); nonce из заголовка совпадает с nonce на скриптах Next → скрипты исполняются.
- Security-заголовки в проде: HSTS (preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy.

## Известные уязвимости (npm audit)

- **postcss <8.5.10 (moderate, XSS в CSS-stringify)** — транзитивно внутри бандла Next.js (`next → postcss`). **Не эксплуатируется**: недоверенный CSS через postcss не обрабатывается. `npm audit fix --force` откатил бы Next до v9 — недопустимо. Действие: обновить Next.js, когда выйдет релиз с патченым postcss.

## Перед продакшеном (эксплуатация)

- HTTPS обязателен (HSTS уже включается только при `NODE_ENV=production`).
- Убрать из `.env`: `PAYMENT_MOCK`, `ADMIN_2FA_DISABLED` (в проде игнорируются, но не хранить).
- Сгенерировать сильные `AUTH_SECRET` и `CODE_ENCRYPTION_KEY` (64 hex), задать реальные ключи Kaspi/Freedom/Resend.
- Настроить cron на `scripts/backup-db.sh` и Sentry (`SENTRY_DSN`) со scrubbing ПД.
- Прогнать OWASP ZAP baseline scan.
