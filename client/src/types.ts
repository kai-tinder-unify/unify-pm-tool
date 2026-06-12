export type Role = 'admin' | 'member';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';
export type Priority = 'high' | 'medium' | 'low';

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
  estimatedDueDate: string | null;
  targetStartDate: string | null;
  estimatedHours: number | null;
  bucket: string;
  initiative: string | null; // optional
  ownerId: string | null;
  owner: UserRef | null;
  createdById: string;
  createdBy: UserRef;
  assignments: Assignment[];
  createdAt: string;
  updatedAt: string;
}

export interface Briefing {
  id: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  generatedAt: string;
  sentViaEmail: boolean;
  sentViaTeams: boolean;
  sentAt: string | null;
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
  briefingDistributionList?: string;
}
