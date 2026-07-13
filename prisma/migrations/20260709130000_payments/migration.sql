-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "code_encrypted" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "success_token" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_success_token_key" ON "orders"("success_token");

