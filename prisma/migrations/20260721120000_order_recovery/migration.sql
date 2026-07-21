-- AlterTable: отметка отправленного письма-дожима брошенного заказа
ALTER TABLE "orders" ADD COLUMN "recovery_email_sent_at" TIMESTAMP(3);
