import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TaskStatus, PartStatus, UnitStatus } from '@hvacflow/shared-types';
import { formatDistanceToNow, format, differenceInMinutes } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Task status helpers ──────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: 'Pending',
  [TaskStatus.Ready]: 'Ready',
  [TaskStatus.InProgress]: 'In Progress',
  [TaskStatus.PendingVerification]: 'Pending Verification',
  [TaskStatus.Completed]: 'Completed',
  [TaskStatus.OnHold]: 'On Hold',
  [TaskStatus.Rejected]: 'Rejected',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: 'text-muted-foreground',
  [TaskStatus.Ready]: 'text-blue-400',
  [TaskStatus.InProgress]: 'text-yellow-400',
  [TaskStatus.PendingVerification]: 'text-orange-400',
  [TaskStatus.Completed]: 'text-green-400',
  [TaskStatus.OnHold]: 'text-orange-400',
  [TaskStatus.Rejected]: 'text-red-400',
};

export const STATUS_BG: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: 'bg-muted/50 text-muted-foreground',
  [TaskStatus.Ready]: 'bg-blue-500/10 text-blue-400',
  [TaskStatus.InProgress]: 'bg-yellow-500/10 text-yellow-400',
  [TaskStatus.PendingVerification]: 'bg-orange-500/10 text-orange-400',
  [TaskStatus.Completed]: 'bg-green-500/10 text-green-400',
  [TaskStatus.OnHold]: 'bg-orange-500/10 text-orange-400',
  [TaskStatus.Rejected]: 'bg-red-500/10 text-red-400',
};

export const PART_STATUS_BG: Record<PartStatus, string> = {
  [PartStatus.Pending]: 'bg-muted/50 text-muted-foreground',
  [PartStatus.InProgress]: 'bg-yellow-500/10 text-yellow-400',
  [PartStatus.Completed]: 'bg-green-500/10 text-green-400',
  [PartStatus.OnHold]: 'bg-orange-500/10 text-orange-400',
  [PartStatus.Rejected]: 'bg-red-500/10 text-red-400',
};

export const UNIT_STATUS_BG: Record<UnitStatus, string> = {
  [UnitStatus.Planned]: 'bg-muted/50 text-muted-foreground',
  [UnitStatus.InProgress]: 'bg-yellow-500/10 text-yellow-400',
  [UnitStatus.Completed]: 'bg-green-500/10 text-green-400',
  [UnitStatus.OnHold]: 'bg-orange-500/10 text-orange-400',
  [UnitStatus.Dispatched]: 'bg-blue-500/10 text-blue-400',
};

// ─── Date/time helpers ────────────────────────────────────────────────────────

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'h:mm a');
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getElapsed(startedAt: string): string {
  const mins = differenceInMinutes(new Date(), new Date(startedAt));
  return formatDuration(mins);
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

export function progressColor(pct: number): string {
  if (pct === 100) return 'bg-green-500';
  if (pct >= 75) return 'bg-blue-500';
  if (pct >= 50) return 'bg-yellow-500';
  if (pct >= 25) return 'bg-orange-500';
  return 'bg-muted';
}

// ─── Task action helpers ──────────────────────────────────────────────────────

export function getPrimaryAction(status: TaskStatus, permissions: string[]) {
  if (status === TaskStatus.Ready && permissions.includes('task:start')) {
    return { label: 'Start Task', action: 'start', variant: 'default' as const };
  }
  if (status === TaskStatus.InProgress && permissions.includes('task:complete')) {
    return { label: 'Complete', action: 'complete', variant: 'default' as const };
  }
  if (status === TaskStatus.PendingVerification && permissions.includes('task:verify')) {
    return { label: 'Verify & Complete', action: 'verify', variant: 'default' as const };
  }
  return null;
}

// ─── String helpers ───────────────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length)}…` : str;
}
