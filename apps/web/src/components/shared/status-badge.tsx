import { cn, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import { TaskStatus } from '@hvacflow/shared-types';

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BG[status], className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
        status === TaskStatus.InProgress && 'animate-pulse-dot',
        STATUS_BG[status].split(' ')[1].replace('text-', 'bg-'),
      )} />
      {STATUS_LABELS[status]}
    </span>
  );
}
