-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_ownerId_fkey";

-- DropIndex
DROP INDEX "Task_ownerId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "ownerId";
