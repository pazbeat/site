-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProgramCategory" AS ENUM ('massage', 'spa', 'set');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('nominal', 'program');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('active', 'partially_used', 'used', 'expired', 'refunded', 'blocked');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'expired', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('kaspi', 'freedom');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('email', 'whatsapp');

-- CreateEnum
CREATE TYPE "AltegioSyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "LegalDocType" AS ENUM ('offer', 'privacy', 'rules', 'consent_modal');

-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "RedemptionSource" AS ENUM ('altegio', 'admin');

-- CreateEnum
CREATE TYPE "CorporateStatus" AS ENUM ('new', 'in_progress', 'closed');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('superadmin', 'manager');

-- CreateTable
CREATE TABLE "salons" (
    "id" SERIAL NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altegio_location_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "salons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" SERIAL NOT NULL,
    "category" "ProgramCategory" NOT NULL,
    "names" JSONB NOT NULL,
    "descriptions" JSONB NOT NULL,
    "photo_url" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_options" (
    "id" SERIAL NOT NULL,
    "program_id" INTEGER NOT NULL,
    "duration_min" INTEGER,
    "persons" INTEGER,
    "price_kzt" INTEGER NOT NULL,

    CONSTRAINT "program_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominals" (
    "id" SERIAL NOT NULL,
    "amount_kzt" INTEGER NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "nominals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designs" (
    "id" SERIAL NOT NULL,
    "names" JSONB NOT NULL,
    "bg_style" JSONB NOT NULL,
    "text_color" TEXT NOT NULL,
    "artwork_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" SERIAL NOT NULL,
    "type" "LegalDocType" NOT NULL,
    "current_version_id" INTEGER,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_versions" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "content_html_sanitized" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ru',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_id" INTEGER,

    CONSTRAINT "legal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "salon_id" INTEGER NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "buyer_phone" TEXT,
    "amount_kzt" INTEGER NOT NULL,
    "promo_id" INTEGER,
    "payment_provider" "PaymentProvider",
    "payment_id" TEXT,
    "consent" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "salon_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_display" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "program_option_id" INTEGER,
    "amount_kzt" INTEGER,
    "balance_kzt" INTEGER NOT NULL,
    "design_id" INTEGER NOT NULL,
    "to_name" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "message" TEXT,
    "status" "CertificateStatus" NOT NULL DEFAULT 'active',
    "delivery_method" "DeliveryMethod" NOT NULL,
    "delivery_contact" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3) NOT NULL,
    "altegio_sync_status" "AltegioSyncStatus" NOT NULL DEFAULT 'pending',
    "altegio_certificate_id" TEXT,
    "altegio_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "amount_kzt" INTEGER NOT NULL,
    "salon_id" INTEGER,
    "source" "RedemptionSource" NOT NULL,
    "actor" TEXT NOT NULL,
    "idem_key" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolled_back_at" TIMESTAMP(3),

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promos" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PromoKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "limits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_requests" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "CorporateStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "totp_secret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_key" ON "legal_documents"("type");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_current_version_id_key" ON "legal_documents"("current_version_id");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_hash_key" ON "certificates"("code_hash");

-- CreateIndex
CREATE INDEX "certificates_status_valid_until_idx" ON "certificates"("status", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_idem_key_key" ON "redemptions"("idem_key");

-- CreateIndex
CREATE UNIQUE INDEX "promos_code_key" ON "promos"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "program_options" ADD CONSTRAINT "program_options_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "legal_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_versions" ADD CONSTRAINT "legal_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_versions" ADD CONSTRAINT "legal_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_program_option_id_fkey" FOREIGN KEY ("program_option_id") REFERENCES "program_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

