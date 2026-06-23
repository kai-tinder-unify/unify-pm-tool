export type Role = 'admin' | 'member';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'closed' | 'paused';
export type Priority = 'high' | 'medium' | 'low';
// Self-reported weekly client-engagement level (Capacity page). Maps to a baseline
// of client hours via the capacityHours* settings (low=30 / medium=40 / high=50 by
// default). Advisory only — nothing is blocked or capped on it.
export type CapacityLevel = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  pingTime: string | null;
  createdAt?: string;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface Assignment {
  id: string;
  taskId: string;
  userId: string;
  user: UserRef;
  startDate: string | null;
  endDate: string | null;
  hoursLogged: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  requestedBy: string; // leader name
  submittedAt: string;
  status: TaskStatus;
  priority: Priority;
  isWip: boolean;
  // ISO timestamp the task became terminal (status === 'closed'); null otherwise
  // and cleared on reopen. Drives the Closed board column and Closed-tasks report.
  closedAt: string | null;
  estimatedDueDate: string | null;
  targetStartDate: string | null;
  estimatedHours: number | null;
  bucket: string;
  initiative: string | null; // optional
  // Salesforce opportunity link or 15/18-char ID, captured (mainly on proposals)
  // so the external influenced-revenue dashboard can match a proposal to its $.
  salesforceOpportunity: string | null;
  // Parent task id when this task is a subtask; null for top-level tasks. Used to
  // keep subtasks out of the board's top-level columns and to render the
  // "Part of: <parent>" backlink on a subtask's detail page.
  parentId: string | null;
  // One level of child tasks (only populated on a top-level task). Optional because
  // list endpoints/older cached shapes may omit it; the board chip and TaskDetail
  // both guard with `subtasks?.length`.
  subtasks?: Task[];
  createdById: string;
  createdBy: UserRef;
  assignments: Assignment[];
  createdAt: string;
  updatedAt: string;
}

// One person's self-reported engagement level for a single week, as returned by
// GET /api/capacity. weekStart is the Monday 00:00 UTC of the rated week.
export interface WeeklyCapacity {
  id: string;
  userId: string;
  user: UserRef;
  weekStart: string;
  level: CapacityLevel;
  createdAt: string;
  updatedAt: string;
}

export interface Briefing {
  id: string;
  // Owner of the briefing. Briefings are personal — the API only ever returns the
  // current user's own, so this is always the signed-in user's id.
  userId: string;
  // Range bounds (UTC calendar dates); a briefing can span any window, not just a week.
  weekStart: string;
  weekEnd: string;
  content: string;
  generatedAt: string;
}

export interface Settings {
  buckets: string;
  initiatives: string;
  defaultPingTime?: string;
  pingEnabled?: string;
  briefingDay?: string;
  briefingTime?: string;
  briefingEnabled?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpFrom?: string;
  smtpPassSet?: boolean;
  teamsWebhookUrl?: string;
  // Per-category Teams webhooks; a blank value falls back to teamsWebhookUrl (default
  // channel). Lets assignments / reminder pings / the daily digest post to their own
  // channels. Backward compatible with single-webhook setups.
  teamsWebhookPings?: string;
  teamsWebhookDaily?: string;
  teamsPingEnabled?: string;
  briefingDistributionList?: string;
  // Capacity (advisory): level→client-hours mapping and the soft 40h reference line.
  // Stored as strings like every other setting; parsed to numbers where used.
  capacityHoursLow?: string;
  capacityHoursMedium?: string;
  capacityHoursHigh?: string;
  capacitySoftTargetHours?: string;
}
