-- CreateEnum
CREATE TYPE "WalletPlatform" AS ENUM ('apple', 'google');

-- CreateTable
CREATE TABLE "wallet_passes" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "platform" "WalletPlatform" NOT NULL,
    "serial_number" TEXT NOT NULL,
    "auth_token_enc" TEXT NOT NULL,
    "google_object_id" TEXT,
    "shown_balance_kzt" INTEGER,
    "last_pushed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_devices" (
    "id" TEXT NOT NULL,
    "pass_id" TEXT NOT NULL,
    "device_library_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_passes_serial_number_key" ON "wallet_passes"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_passes_certificate_id_platform_key" ON "wallet_passes"("certificate_id", "platform");

-- CreateIndex
CREATE INDEX "wallet_devices_device_library_id_idx" ON "wallet_devices"("device_library_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_devices_pass_id_device_library_id_key" ON "wallet_devices"("pass_id", "device_library_id");

-- AddForeignKey
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_devices" ADD CONSTRAINT "wallet_devices_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "wallet_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

