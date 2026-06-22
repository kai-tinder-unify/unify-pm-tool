-- CreateEnum
CREATE TYPE "CapacityLevel" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "WeeklyCapacity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "level" "CapacityLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyCapacity_weekStart_idx" ON "WeeklyCapacity"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCapacity_userId_weekStart_key" ON "WeeklyCapacity"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "WeeklyCapacity" ADD CONSTRAINT "WeeklyCapacity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
