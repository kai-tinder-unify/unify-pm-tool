-- Rename the terminal status value in place. We use ALTER TYPE ... RENAME VALUE
-- (rather than letting Prisma drop/recreate the enum) so every existing Task row
-- that is currently 'complete' survives the change and becomes 'closed' — a
-- drop/recreate would fail on rows still referencing the old value.
ALTER TYPE "TaskStatus" RENAME VALUE 'complete' TO 'closed';

-- Add the timestamp we stamp when a task transitions into the terminal 'closed'
-- state (cleared back to NULL on reopen). Nullable: tasks that have never been
-- closed simply have no closedAt.
ALTER TABLE "Task" ADD COLUMN "closedAt" TIMESTAMP(3);
