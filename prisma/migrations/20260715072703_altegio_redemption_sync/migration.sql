-- AlterEnum
ALTER TYPE "AltegioSyncStatus" ADD VALUE 'missing';

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "altegio_balance_kzt" INTEGER,
ADD COLUMN     "altegio_checked_at" TIMESTAMP(3),
ADD COLUMN     "altegio_client_phone" TEXT,
ADD COLUMN     "altegio_company_id" INTEGER,
ADD COLUMN     "altegio_number_id" INTEGER;

-- CreateIndex
CREATE INDEX "certificates_altegio_sync_status_altegio_company_id_idx" ON "certificates"("altegio_sync_status", "altegio_company_id");
