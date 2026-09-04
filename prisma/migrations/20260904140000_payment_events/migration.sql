-- Журнал ответов платёжного провайдера (2026-09-04).
--
-- До него доказать «банк ответил, что оплачено в 14:07» было нечем: ответы
-- жили в логе контейнера. При споре с покупателем и при сверке с выпиской
-- это единственный документ на нашей стороне.

CREATE TABLE "payment_events" (
  "id"           TEXT NOT NULL,
  "order_id"     TEXT NOT NULL,
  "provider"     VARCHAR(16) NOT NULL,
  "source"       VARCHAR(16) NOT NULL,
  "kind"         VARCHAR(16) NOT NULL,
  "external_ref" VARCHAR(128),
  "status_raw"   VARCHAR(64),
  "amount_kzt"   INTEGER,
  "note"         VARCHAR(500),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_events_order_id_created_at_idx"
  ON "payment_events" ("order_id", "created_at");

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
