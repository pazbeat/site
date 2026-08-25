-- Аналитика источников трафика и продаж.
--
-- Задача: видеть не «сколько зашло», а «кто из них купил». Канал снимается
-- один раз при заходе и переносится в сам заказ, поэтому выручка по каналам
-- считается в нашей админке и сходится с деньгами до тенге.

-- Заходы по каналам: только счётчик «день × канал × стадия».
-- Ни IP, ни браузера, ни идентификатора посетителя здесь нет.
CREATE TABLE "visit_stats" (
    "id"     SERIAL       NOT NULL,
    "day"    DATE         NOT NULL,
    "source" VARCHAR(16)  NOT NULL,
    "stage"  VARCHAR(8)   NOT NULL,
    "visits" INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "visit_stats_pkey" PRIMARY KEY ("id")
);

-- Все колонки NOT NULL намеренно: в Postgres NULL не дедуплицируется
-- уникальным индексом, а «прямой заход» — самая частая строка.
CREATE UNIQUE INDEX "visit_stats_day_source_stage_key"
    ON "visit_stats"("day", "source", "stage");

-- Источник в заказе. Скалярами, а не Json: отчёт строится через GROUP BY.
ALTER TABLE "orders" ADD COLUMN "src_first"     VARCHAR(16);
ALTER TABLE "orders" ADD COLUMN "src_last"      VARCHAR(16);
ALTER TABLE "orders" ADD COLUMN "src_campaign"  VARCHAR(32);
ALTER TABLE "orders" ADD COLUMN "click_id_type" VARCHAR(8);
ALTER TABLE "orders" ADD COLUMN "click_id"      VARCHAR(512);

-- Время поступления денег. Отдельно от created_at: оплата бывает много позже
-- создания заказа — вебхуков у Kaspi и Forte нет, статус узнаём опросом.
ALTER TABLE "orders" ADD COLUMN "paid_at" TIMESTAMP(3);

-- Отчёт «Источники» группирует оплаченные заказы по каналу.
CREATE INDEX "orders_src_last_status_idx" ON "orders"("src_last", "status");

ALTER TABLE "corporate_requests" ADD COLUMN "src_last"     VARCHAR(16);
ALTER TABLE "corporate_requests" ADD COLUMN "src_campaign" VARCHAR(32);
