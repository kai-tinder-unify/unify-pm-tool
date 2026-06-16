import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// Work types (kept as-is). Tasks carry one of these as `bucket`.
const BUCKETS = [
  'Proposal/Delivery Support',
  'Internal Operations Support',
  'Business Development Support',
];

// Strategic initiatives (kept as-is). Not tracked per-task in the source sheets,
// so seeded tasks leave `initiative` null; the list still drives the picker.
const INITIATIVES = [
  'Artificial Intelligence Management Consulting Firm of Choice',
  'All In for Unify',
  'Account Intelligence & Excellence',
  'Alliance Investment',
];

// --- Date helpers --------------------------------------------------------------
// Calendar-day fields (submitted / due / start) are stored at UTC midnight, matching
// how the app persists date-picker values, so they display on the correct day.
function calDay(s: string | null | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00Z`) : null;
}
// `updatedAt` is a true timestamp the app compares against "now" (e.g. Pulse's
// "completed since last meeting", weekly briefing windows). We stamp it at NOON UTC
// of the real activity date so the calendar-day still resolves correctly for users
// in US timezones (local midnight Monday lands a few hours into the UTC day; noon
// clears it) — UTC midnight would read as the previous day and drop from the window.
function stamp(s: string): Date {
  return new Date(`${s}T12:00:00Z`);
}

// --- Shape of the seed dataset (see build-seed-data.py for the sheet -> JSON map) ---
type SeedUser = { name: string; email: string; role: 'admin' | 'member'; pingTime: string | null };
type SeedAssignment = {
  userEmail: string;
  startDate: string | null;
  endDate: string | null;
  hoursLogged: number;
  notes: string | null;
  touchedAt: string; // real "last touched" date -> backdated assignment.updatedAt
};
type SeedTask = {
  title: string;
  description: string | null;
  requestedBy: string;
  bucket: string;
  initiative: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete' | 'paused';
  priority: 'high' | 'medium' | 'low';
  isWip: boolean;
  submittedAt: string;
  estimatedDueDate: string | null;
  targetStartDate: string | null;
  estimatedHours: number | null;
  updatedAt: string; // real completion / last-activity date -> backdated task.updatedAt
  ownerEmail: string | null;
  createdByEmail: string;
  assignments: SeedAssignment[];
};
type SeedData = { users: SeedUser[]; tasks: SeedTask[] };

// Synthetic account for developers to log in and test admin features without touching
// a real person's account. Safe to commit: it's fictional, owns no tasks, contributes
// 0 hours, and uses the reserved `.test` TLD (RFC 2606) so it can never resolve to a
// real inbox. It's added on top of whichever dataset loads, so it's always present.
const DEV_ACCOUNTS: SeedUser[] = [
  { name: 'Dev Admin', email: 'dev@ascendhub.test', role: 'admin', pingTime: null },
];

// Load the dataset: the real, gitignored seed-data.json if it's present, otherwise
// the committed synthetic seed-data.example.json — so a fresh clone / CI still boots
// with safe demo data, and a developer's real file transparently takes over once
// dropped in. See the README "Seeding" section for how the real file is distributed.
function loadSeedData(): { data: SeedData; source: string } {
  const realPath = join(__dirname, 'seed-data.json');
  const examplePath = join(__dirname, 'seed-data.example.json');
  const path = existsSync(realPath) ? realPath : examplePath;
  const data = JSON.parse(readFileSync(path, 'utf-8')) as SeedData;
  return { data, source: existsSync(realPath) ? 'seed-data.json (real)' : 'seed-data.example.json (synthetic)' };
}

async function main() {
  const { data, source } = loadSeedData();
  console.log(`Seeding Unify Ascend Task Hub from ${source}...`);

  // --- AppSettings (buckets/initiatives kept; ping + briefing config preserved) ---
  // upsert so re-running never clobbers values an admin may have changed in the UI.
  const settings: Record<string, string> = {
    buckets: JSON.stringify(BUCKETS),
    initiatives: JSON.stringify(INITIATIVES),
    defaultPingTime: '08:00',
    pingEnabled: 'true',
    briefingDay: 'friday',
    briefingTime: '16:00',
    briefingEnabled: 'true',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpFrom: 'Ascend Hub <noreply@unifyconsulting.com>',
    teamsWebhookUrl: '',
    briefingDistributionList: '',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // --- Full wipe -----------------------------------------------------------------
  // This is a "redo the seed" reset: clear all transactional rows in FK-safe order,
  // then users, so the database reflects only the current dataset. (AppSettings is
  // left intact — upserted above.)
  await prisma.checkIn.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.weeklyBriefing.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();

  // --- Users ---------------------------------------------------------------------
  // The dataset's users plus the always-on synthetic Dev Admin. Shared default
  // password for the initial rollout; users can change it later.
  const passwordHash = await bcrypt.hash('ascend123', 10);
  const emailToId = new Map<string, string>();
  for (const u of [...data.users, ...DEV_ACCOUNTS]) {
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, role: u.role, pingTime: u.pingTime, passwordHash },
    });
    emailToId.set(u.email, created.id);
  }

  // --- Tasks + assignments -------------------------------------------------------
  // Collect (row id -> real timestamp) so we can backdate `updatedAt` after creation;
  // Prisma's @updatedAt would otherwise force every row to "now", collapsing all
  // history onto today and breaking the date-based views.
  const taskStamps: { id: string; at: Date }[] = [];
  const assignmentStamps: { id: string; at: Date }[] = [];

  for (const t of data.tasks) {
    const ownerId = t.ownerEmail ? emailToId.get(t.ownerEmail) ?? null : null;
    const createdById = emailToId.get(t.createdByEmail)!;

    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        requestedBy: t.requestedBy,
        submittedAt: calDay(t.submittedAt)!,
        status: t.status,
        priority: t.priority,
        isWip: t.isWip,
        estimatedDueDate: calDay(t.estimatedDueDate),
        targetStartDate: calDay(t.targetStartDate),
        estimatedHours: t.estimatedHours,
        bucket: t.bucket,
        initiative: t.initiative,
        ownerId,
        createdById,
        // createdAt drives "WIP age" — anchor it to intake, not seed time.
        createdAt: calDay(t.submittedAt)!,
      },
    });
    taskStamps.push({ id: task.id, at: stamp(t.updatedAt) });

    for (const a of t.assignments) {
      const userId = emailToId.get(a.userEmail);
      if (!userId) continue; // unknown contributor — skip rather than fabricate
      const assignment = await prisma.taskAssignment.create({
        data: {
          taskId: task.id,
          userId,
          startDate: calDay(a.startDate),
          endDate: calDay(a.endDate),
          hoursLogged: a.hoursLogged,
          notes: a.notes,
          createdAt: calDay(a.startDate) ?? calDay(t.submittedAt)!,
        },
      });
      assignmentStamps.push({ id: assignment.id, at: stamp(a.touchedAt) });
    }
  }

  // --- Backdate updatedAt via raw SQL (bypasses Prisma's @updatedAt) -------------
  // One transaction keeps the ~hundreds of small updates fast and atomic.
  await prisma.$transaction([
    ...taskStamps.map((s) =>
      prisma.$executeRaw`UPDATE "Task" SET "updatedAt" = ${s.at} WHERE "id" = ${s.id}`,
    ),
    ...assignmentStamps.map((s) =>
      prisma.$executeRaw`UPDATE "TaskAssignment" SET "updatedAt" = ${s.at} WHERE "id" = ${s.id}`,
    ),
  ]);

  const adminEmails = [...data.users, ...DEV_ACCOUNTS]
    .filter((u) => u.role === 'admin')
    .map((u) => u.email);
  console.log(
    `Seed complete: ${data.users.length + DEV_ACCOUNTS.length} users, ` +
      `${data.tasks.length} tasks, ${assignmentStamps.length} assignments.`,
  );
  console.log(`Admin logins (password 'ascend123'): ${adminEmails.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
