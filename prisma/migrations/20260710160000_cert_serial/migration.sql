-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "serial" TEXT;

-- AlterTable
ALTER TABLE "salons" ADD COLUMN     "code_prefix" TEXT,
ADD COLUMN     "last_cert_serial" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "certificates_serial_key" ON "certificates"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "salons_code_prefix_key" ON "salons"("code_prefix");

