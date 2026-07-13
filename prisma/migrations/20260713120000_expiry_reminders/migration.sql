-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "reminder_30_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_7_sent_at" TIMESTAMP(3);
