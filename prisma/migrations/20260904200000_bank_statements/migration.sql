-- Выписки банков, загруженные бухгалтером (2026-09-04).
--
-- Сверять продажи с выпиской глазами — это то, ради чего таблица и ведётся с
-- марта 2025. Здесь выписка загружается файлом, и каждая строка связывается с
-- нашим заказом. Хранится вся выписка, а не только расхождения: иначе нельзя
-- ответить на главный вопрос — какой платёж банка НЕ наш, то есть за какие
-- деньги покупатель не получил сертификата.

CREATE TABLE "bank_statement_entries" (
  "id"          TEXT NOT NULL,
  "source"      VARCHAR(16) NOT NULL,
  "operated_at" TIMESTAMP(3) NOT NULL,
  "amount_kzt"  INTEGER NOT NULL,
  "reference"   VARCHAR(128),
  "raw"         JSONB NOT NULL,
  "order_id"    TEXT,
  "matched_by"  VARCHAR(16),
  "batch_id"    VARCHAR(64) NOT NULL,
  "uploaded_by" VARCHAR(160) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bank_statement_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_statement_entries_source_operated_at_idx"
  ON "bank_statement_entries" ("source", "operated_at");
CREATE INDEX "bank_statement_entries_order_id_idx"
  ON "bank_statement_entries" ("order_id");

ALTER TABLE "bank_statement_entries"
  ADD CONSTRAINT "bank_statement_entries_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
