-- AlterTable
ALTER TABLE "nominals" ADD COLUMN     "variant" VARCHAR(1);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "ab_variant" VARCHAR(1);

-- CreateTable
CREATE TABLE "ab_stats" (
    "id" SERIAL NOT NULL,
    "day" DATE NOT NULL,
    "variant" VARCHAR(1) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ab_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ab_stats_day_variant_key" ON "ab_stats"("day", "variant");
