'use client';

import { cn, getElapsed, STATUS_BG } from '@/lib/utils';
import { TaskStatus } from '@hvacflow/shared-types';
import { Avatar, Button } from '@/components/shared';
import { PriorityDot } from '@/components/shared/priority-dot';
import { Clock, Check } from 'lucide-react';

interface TaskCardProps {
  task: any;
  onClick?: () => void;
  onComplete?: (taskId: string) => void;
  completing?: boolean;
}

export function TaskCard({ task, onClick, onComplete, completing }: TaskCardProps) {
  const isInProgress = task.status === TaskStatus.InProgress;
  const isPendingVerification = task.status === TaskStatus.PendingVerification;
  const isOnHold = task.status === TaskStatus.OnHold;
  const isReady = task.status === TaskStatus.Ready;
  const canComplete = (isReady || isInProgress) && !!onComplete;
  const unitSerial = task.part?.unit?.serialNumber ?? task.unit?.serialNumber ?? '—';
  const partLabel = task.part ? `${task.part.partType?.name} · ${task.part.identifier}` : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'task-card group select-none',
        !onClick && 'cursor-default hover:border-border hover:bg-card hover:shadow-none',
        isOnHold && 'opacity-60',
        isPendingVerification && 'border-orange-500/40',
      )}
    >
      {/* Process name + status indicator */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-foreground leading-tight">
          {task.processDefinition?.name}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isInProgress && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse-dot" />
          )}
          {isPendingVerification && (
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
          )}
        </div>
      </div>

      {/* Unit / Part */}
      <div className="space-y-0.5 mb-3">
        <p className="text-xs text-foreground font-medium tabular-nums">{unitSerial}</p>
        {partLabel && (
          <p className="text-xs text-muted-foreground truncate">{partLabel}</p>
        )}
      </div>

      {/* Footer: priority + assignee + elapsed */}
      <div className="flex items-center justify-between">
        <PriorityDot
          color={task.priorityLevel?.color}
          name={task.priorityLevel?.name}
          showLabel
        />

        <div className="flex items-center gap-2">
          {isInProgress && task.startedAt && (
            <span className="flex items-center gap-1 text-xs text-yellow-400 tabular-nums">
              <Clock className="w-3 h-3" />
              {getElapsed(task.startedAt)}
            </span>
          )}
          {task.assignedUser ? (
            <Avatar name={task.assignedUser.name} size="xs" />
          ) : (
            <div className="w-5 h-5 rounded-full border border-dashed border-border" />
          )}
        </div>
      </div>

      {/* On hold label */}
      {isOnHold && (
        <div className="mt-2 text-xs text-orange-400 font-medium">On Hold</div>
      )}

      {/* Task Completed - no separate start/end step, no side panel
          needed for the common case. Clicking anywhere else on the card
          still opens the detail drawer, for notes/checklist/history. */}
      {canComplete && (
        <Button
          size="sm"
          className="w-full mt-3"
          loading={completing}
          onClick={(e) => {
            e.stopPropagation();
            onComplete!(task.id);
          }}
        >
          <Check className="w-3.5 h-3.5" />
          Task Completed
        </Button>
      )}
    </div>
  );
}
