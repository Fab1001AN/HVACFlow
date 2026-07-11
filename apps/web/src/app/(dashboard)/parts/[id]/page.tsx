'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Spinner, Card, ProgressBar, Button } from '@/components/shared';
import { CheckCircle, Circle, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { PART_STATUS_BG, formatDateTime, formatDuration } from '@/lib/utils';
import { TaskStatus, PartStatus } from '@hvacflow/shared-types';
import { cn } from '@/lib/utils';
import { useWsEvent, useSubscribeUnit } from '@/lib/websocket';

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: part, isLoading } = useQuery({
    queryKey: ['part', id],
    queryFn: () => api.parts.get(id),
  });

  const unitId = part?.unit?.id;
  useSubscribeUnit(unitId ?? null);

  useWsEvent('part.progressChanged', (payload) => {
    if (payload.partId === id) queryClient.invalidateQueries({ queryKey: ['part', id] });
  }, [id]);

  useWsEvent('task.statusChanged', () => {
    queryClient.invalidateQueries({ queryKey: ['part', id] });
  }, [id]);

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!part) return null;

  const progress = Number(part.progressPercentage);
  const tasks = part.tasks ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`${part.partType?.name} — ${part.identifier}`}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: part.unit?.order?.project?.customer?.name ?? '…', href: `/customers/${part.unit?.order?.project?.customerId}` },
          { label: part.unit?.order?.orderNumber ?? '…', href: `/orders/${part.unit?.orderId}` },
          { label: part.unit?.serialNumber ?? '…', href: `/units/${part.unitId}` },
          { label: part.identifier },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Part summary */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{part.partType?.name}</span>
              <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', PART_STATUS_BG[part.status as PartStatus] ?? 'bg-muted text-muted-foreground')}>
                {part.status}
              </span>
              {part.quantity > 1 && (
                <span className="text-xs text-muted-foreground">Qty: {part.quantity}</span>
              )}
            </div>
            <span className="text-sm font-medium tabular-nums">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} size="md" />
        </Card>

        {/* Production task chain */}
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Production Tasks</h2>
          {tasks.length === 0 ? (
            <Card className="flex items-center justify-center h-24">
              <span className="text-sm text-muted-foreground">No tasks generated yet</span>
            </Card>
          ) : (
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

              <div className="space-y-1">
                {tasks.map((task: any, index: number) => {
                  const isActive = [TaskStatus.InProgress, TaskStatus.PendingVerification, TaskStatus.Ready].includes(task.status);
                  return (
                    <button key={task.id} onClick={() => setSelectedTaskId(task.id)}
                      className={cn('w-full flex items-center gap-4 p-3 rounded-lg border text-left transition-all',
                        isActive ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' :
                        task.status === TaskStatus.Completed ? 'border-border hover:bg-accent/50' :
                        'border-transparent hover:border-border hover:bg-accent/30'
                      )}>
                      <div className="relative z-10 flex-shrink-0">
                        <TaskIcon status={task.status} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium', task.status === TaskStatus.Pending ? 'text-muted-foreground' : 'text-foreground')}>
                            {task.processDefinition?.name}
                          </span>
                          <span className="text-xs text-muted-foreground">{task.department?.name}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {task.assignedUser && (
                            <span className="text-xs text-muted-foreground">{task.assignedUser.name}</span>
                          )}
                          {task.startedAt && task.completedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(task.actualDurationMinutes ?? 0)}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                      <PriorityDot color={task.priorityLevel?.color} name={task.priorityLevel?.name} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}

function TaskIcon({ status }: { status: TaskStatus }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0';
  if (status === TaskStatus.Completed) return <div className={cn(base, 'bg-green-500/20')}><CheckCircle className="w-4 h-4 text-green-400" /></div>;
  if (status === TaskStatus.InProgress) return <div className={cn(base, 'bg-yellow-500/20')}><Clock className="w-4 h-4 text-yellow-400 animate-pulse" /></div>;
  if (status === TaskStatus.PendingVerification) return <div className={cn(base, 'bg-orange-500/20')}><Clock className="w-4 h-4 text-orange-400" /></div>;
  if (status === TaskStatus.Ready) return <div className={cn(base, 'bg-blue-500/20')}><Circle className="w-4 h-4 text-blue-400" /></div>;
  if (status === TaskStatus.Rejected) return <div className={cn(base, 'bg-red-500/20')}><AlertCircle className="w-4 h-4 text-red-400" /></div>;
  return <div className={cn(base, 'bg-muted')}><Circle className="w-4 h-4 text-muted-foreground" /></div>;
}
