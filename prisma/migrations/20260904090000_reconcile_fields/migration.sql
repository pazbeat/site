-- Поля для сверки контура «оплата → выпуск → CRM → доставка» (2026-09-04).
--
-- Раньше провалившийся синк с Altegio помечался словом `failed` и на этом
-- история заканчивалась: ни счётчика попыток, ни причины, ни автоповтора.
-- Сертификат оставался у покупателя на руках, а в кассе его не было —
-- кассир такой сертификат не находил. То же с доставкой: письмо не ушло,
-- и об этом никто не узнавал.

ALTER TABLE "certificates"
  ADD COLUMN "altegio_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "altegio_last_error" TEXT,
  ADD COLUMN "delivery_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_last_error" TEXT;

-- Сверка «выпущено, но не доставлено» ходит по этой паре каждые 10 минут
CREATE INDEX "certificates_sent_at_scheduled_at_idx"
  ON "certificates" ("sent_at", "scheduled_at");
