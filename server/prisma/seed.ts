import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BUCKETS = [
  'Proposal/Delivery Support',
  'Internal Operations Support',
  'Business Development Support',
];

const INITIATIVES = [
  'Artificial Intelligence Management Consulting Firm of Choice',
  'All In for Unify',
  'Account Intelligence & Excellence',
  'Alliance Investment',
];

// Calendar-day fields (submitted / due / start / end) are stored at UTC midnight,
// matching how the app persists date-picker values, so they display correctly.
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function main() {
  console.log('Seeding Unify Ascend Task Hub...');

  // --- AppSettings ---
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
    await prisma.appSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // --- Users: 1 admin + 4 members (2 with custom ping times) ---
  const password = await bcrypt.hash('ascend123', 10);
  const usersData = [
    { name: 'Kai Tinder', email: 'ktinder@unifyconsulting.com', role: 'admin' as const, pingTime: null },
    { name: 'Maya Castellanos', email: 'mcastellanos@unifyconsulting.com', role: 'member' as const, pingTime: '07:30' },
    { name: 'Derek Whitfield', email: 'dwhitfield@unifyconsulting.com', role: 'member' as const, pingTime: null },
    { name: 'Priya Raghunathan', email: 'praghunathan@unifyconsulting.com', role: 'member' as const, pingTime: '09:00' },
    { name: 'Jordan Okafor', email: 'jokafor@unifyconsulting.com', role: 'member' as const, pingTime: null },
  ];

  const users = [];
  for (const u of usersData) {
    users.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash: password },
      }),
    );
  }
  const [kai, maya, derek, priya, jordan] = users;

  // Idempotency: if tasks already exist, skip sample data
  const existing = await prisma.task.count();
  if (existing > 0) {
    console.log('Sample data already present — skipping tasks/assignments.');
    return;
  }

  // --- Tasks (10): mix of leaders, priorities, statuses, WIP, due dates; some without an initiative ---
  const t1 = await prisma.task.create({
    data: {
      title: 'Draft assessment dimension model',
      description: 'Define the 6 maturity dimensions and scoring rubric for AI advisory pursuits.',
      requestedBy: 'Sandra Liu', submittedAt: daysAgo(21),
      status: 'complete', priority: 'high', isWip: false,
      estimatedDueDate: daysAgo(7), targetStartDate: daysAgo(20), estimatedHours: 16,
      bucket: BUCKETS[0], initiative: INITIATIVES[0],
      ownerId: maya.id, createdById: kai.id,
    },
  });
  const t2 = await prisma.task.create({
    data: {
      title: 'Build slide library v1',
      description: 'Translate the dimension model into a branded slide library.',
      requestedBy: 'Sandra Liu', submittedAt: daysAgo(21),
      status: 'in_progress', priority: 'high', isWip: false,
      estimatedDueDate: daysFromNow(5), targetStartDate: daysAgo(6), estimatedHours: 24,
      bucket: BUCKETS[0], initiative: INITIATIVES[0],
      ownerId: derek.id, createdById: kai.id,
    },
  });
  const t3 = await prisma.task.create({
    data: {
      title: 'Maintain AI pursuit intel tracker',
      description: 'Ongoing tracker of active AI pursuits and reusable artifacts.',
      requestedBy: 'Sandra Liu', submittedAt: daysAgo(18),
      status: 'in_progress', priority: 'medium', isWip: true,
      bucket: BUCKETS[0], initiative: INITIATIVES[0],
      ownerId: priya.id, createdById: maya.id,
    },
  });
  const t4 = await prisma.task.create({
    data: {
      title: 'Audit current utilization data sources',
      requestedBy: 'Marcus Bell', submittedAt: daysAgo(14),
      status: 'complete', priority: 'medium', isWip: false,
      estimatedDueDate: daysAgo(5), targetStartDate: daysAgo(13), estimatedHours: 8,
      bucket: BUCKETS[1], initiative: INITIATIVES[1],
      ownerId: maya.id, createdById: maya.id,
    },
  });
  const t5 = await prisma.task.create({
    data: {
      title: 'Rebuild rollup workbook',
      description: 'Standardized monthly rollup with practice-level pivots.',
      requestedBy: 'Marcus Bell', submittedAt: daysAgo(14),
      status: 'in_progress', priority: 'high', isWip: false,
      estimatedDueDate: daysFromNow(3), estimatedHours: 20,
      bucket: BUCKETS[1], initiative: INITIATIVES[1],
      ownerId: maya.id, createdById: maya.id,
    },
  });
  const t6 = await prisma.task.create({
    data: {
      title: 'Document the monthly process',
      requestedBy: 'Marcus Bell', submittedAt: daysAgo(12),
      status: 'blocked', priority: 'low', isWip: false,
      estimatedDueDate: daysFromNow(10),
      bucket: BUCKETS[1], initiative: null,
      ownerId: jordan.id, createdById: maya.id,
    },
  });
  const t7 = await prisma.task.create({
    data: {
      title: 'Compile account brief: Meridian Health',
      requestedBy: 'Tara Nguyen', submittedAt: daysAgo(10),
      status: 'not_started', priority: 'high', isWip: false,
      estimatedDueDate: daysFromNow(7), targetStartDate: daysFromNow(1), estimatedHours: 10,
      bucket: BUCKETS[2], initiative: INITIATIVES[2],
      ownerId: derek.id, createdById: derek.id,
    },
  });
  const t8 = await prisma.task.create({
    data: {
      title: 'Refresh healthcare win/loss themes',
      description: 'Ongoing synthesis of win/loss notes across the portfolio.',
      requestedBy: 'Tara Nguyen', submittedAt: daysAgo(10),
      status: 'in_progress', priority: 'medium', isWip: true,
      bucket: BUCKETS[2], initiative: null,
      ownerId: jordan.id, createdById: derek.id,
    },
  });
  const t9 = await prisma.task.create({
    data: {
      title: 'Co-sell one-pagers (3 offerings)',
      requestedBy: 'Sandra Liu', submittedAt: daysAgo(35),
      status: 'complete', priority: 'high', isWip: false,
      estimatedDueDate: daysAgo(15), estimatedHours: 12,
      bucket: BUCKETS[2], initiative: INITIATIVES[3],
      ownerId: priya.id, createdById: kai.id,
    },
  });
  const t10 = await prisma.task.create({
    data: {
      title: 'Internal alliance FAQ',
      requestedBy: 'Sandra Liu', submittedAt: daysAgo(35),
      status: 'complete', priority: 'medium', isWip: false,
      estimatedDueDate: daysAgo(16), estimatedHours: 6,
      bucket: BUCKETS[2], initiative: INITIATIVES[3],
      ownerId: jordan.id, createdById: kai.id,
    },
  });

  // Paused: deliberately parked until the next leadership sync
  await prisma.task.create({
    data: {
      title: 'Partner co-marketing deck',
      description: 'On hold pending alliance direction from the next leadership sync.',
      requestedBy: 'Tara Nguyen', submittedAt: daysAgo(8),
      status: 'paused', priority: 'low', isWip: false,
      bucket: BUCKETS[2], initiative: INITIATIVES[3],
      ownerId: jordan.id, createdById: derek.id,
    },
  });
  // Unowned: entered into the pipeline before anyone has picked it up
  await prisma.task.create({
    data: {
      title: 'Refresh pricing model',
      requestedBy: 'Marcus Bell', submittedAt: daysAgo(1),
      status: 'not_started', priority: 'medium', isWip: false,
      estimatedDueDate: daysFromNow(4), estimatedHours: 5,
      bucket: BUCKETS[1], initiative: null,
      ownerId: null, createdById: kai.id,
    },
  });

  // --- TaskAssignments: backdated, multi-contributor ---
  const assignments = [
    { taskId: t1.id, userId: maya.id, startDate: daysAgo(20), endDate: daysAgo(7), hoursLogged: 14.5, notes: 'Rubric finalized after two leadership reviews.' },
    { taskId: t1.id, userId: kai.id, startDate: daysAgo(18), endDate: daysAgo(8), hoursLogged: 4, notes: 'Review and leadership alignment.' },
    { taskId: t2.id, userId: derek.id, startDate: daysAgo(6), endDate: null, hoursLogged: 11, notes: 'Through dimension 4 of 6.' },
    { taskId: t2.id, userId: priya.id, startDate: daysAgo(4), endDate: null, hoursLogged: 5.5, notes: 'Visual design pass on completed sections.' },
    { taskId: t3.id, userId: priya.id, startDate: daysAgo(15), endDate: null, hoursLogged: 9, notes: 'Weekly upkeep, ~1.5 hrs/week.' },
    { taskId: t4.id, userId: maya.id, startDate: daysAgo(13), endDate: daysAgo(5), hoursLogged: 7, notes: null },
    { taskId: t5.id, userId: maya.id, startDate: daysAgo(4), endDate: null, hoursLogged: 8, notes: 'Pivot structure done; validation remaining.' },
    { taskId: t5.id, userId: jordan.id, startDate: daysAgo(3), endDate: null, hoursLogged: 3, notes: 'Data validation support.' },
    { taskId: t6.id, userId: jordan.id, startDate: daysAgo(2), endDate: null, hoursLogged: 1, notes: 'Blocked on final workbook structure.' },
    { taskId: t8.id, userId: jordan.id, startDate: daysAgo(9), endDate: null, hoursLogged: 6, notes: null },
    { taskId: t9.id, userId: priya.id, startDate: daysAgo(30), endDate: daysAgo(15), hoursLogged: 13, notes: 'All three one-pagers approved.' },
    { taskId: t10.id, userId: jordan.id, startDate: daysAgo(28), endDate: daysAgo(16), hoursLogged: 5, notes: null },
    { taskId: t10.id, userId: kai.id, startDate: daysAgo(20), endDate: daysAgo(16), hoursLogged: 1.5, notes: 'Final review.' },
  ];
  for (const a of assignments) {
    await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId: a.taskId, userId: a.userId } },
      update: {},
      create: a,
    });
  }

  console.log('Seed complete.');
  console.log('Login: ktinder@unifyconsulting.com / ascend123 (admin)');
  console.log('       mcastellanos@unifyconsulting.com / ascend123 (member)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
