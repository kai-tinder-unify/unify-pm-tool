-- Per-person briefings: each WeeklyBriefing now belongs to a user (its owner) and the
-- in-app-only redesign drops the unused email/Teams delivery flags. The table is empty
-- at migration time, so adding the required userId column needs no backfill.

-- AlterTable
ALTER TABLE "WeeklyBriefing"
  DROP COLUMN "sentViaEmail",
  DROP COLUMN "sentViaTeams",
  DROP COLUMN "sentAt",
  ADD COLUMN "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WeeklyBriefing_userId_idx" ON "WeeklyBriefing"("userId");

-- AddForeignKey
ALTER TABLE "WeeklyBriefing" ADD CONSTRAINT "WeeklyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
