-- CreateEnum
CREATE TYPE "ProgramHighlight" AS ENUM ('hit', 'trend', 'season');

-- AlterTable: highlight заменяет popular; бывшие популярные становятся «Хитами»
ALTER TABLE "programs" ADD COLUMN "highlight" "ProgramHighlight";
UPDATE "programs" SET "highlight" = 'hit' WHERE "popular" = true;
ALTER TABLE "programs" DROP COLUMN "popular";
