'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Spinner, Card, ProgressBar, Button, Modal, Select, Textarea } from '@/components/shared';
import { CheckCircle, Circle, Clock, AlertCircle, ChevronRight, Route, GripVertical, X } from 'lucide-react';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { PART_STATUS_BG, formatDateTime, formatDuration } from '@/lib/utils';
import { TaskStatus, PartStatus } from '@hvacflow/shared-types';
import { cn } from '@/lib/utils';
import { useWsEvent, useSubscribeUnit } from '@/lib/websocket';
import { toast } from '@/components/shared';

// Statuses that represent work already done or in flight — these tasks are
// locked and stay exactly as they are. Editing a route only ever replaces
// the still-pending steps that come after them.
const LOCKED_STATUSES = [TaskStatus.Completed, TaskStatus.PendingVerification, TaskStatus.InProgress];

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);

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
        action={
          <Button variant="secondary" leftIcon={<Route className="w-3.5 h-3.5" />} onClick={() => setRouteModalOpen(true)}>
            Edit Route
          </Button>
        }
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

      <EditRouteModal
        open={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        part={part}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['part', id] })}
      />
    </div>
  );
}

function EditRouteModal({
  open,
  onClose,
  part,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  part: any;
  onSaved: () => void;
}) {
  const tasks = part.tasks ?? [];
  const lockedTasks = tasks.filter((t: any) => LOCKED_STATUSES.includes(t.status));
  const pendingTasks = tasks.filter((t: any) => !LOCKED_STATUSES.includes(t.status));

  // Editable list of process definition ids that will replace every
  // currently-pending (not yet started) task. Seeded from the part's
  // current pending steps so editing is additive by default.
  const [steps, setSteps] = useState<{ id: string; name: string }[]>([]);
  const [addingId, setAddingId] = useState('');
  const [reason, setReason] = useState('');

  const { data: processDefinitions = [] } = useQuery({
    queryKey: ['process-definitions', 'active', 'part'],
    queryFn: () => api.processDefinitions.list({ isActive: true }),
    enabled: open,
  });

  // Seed the editable list once per time the modal opens; reset on close.
  useEffect(() => {
    if (open) {
      setSteps(pendingTasks.map((t: any) => ({ id: t.processDefinitionId, name: t.processDefinition?.name ?? 'Unknown process' })));
    } else {
      setReason('');
      setAddingId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part.id]);

  const saveMutation = useMutation({
    mutationFn: () => api.parts.replaceRoute(part.id, steps.map((s) => s.id), reason),
    onSuccess: () => {
      toast('Route updated — pending steps replaced', 'success');
      onSaved();
      onClose();
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addStep = () => {
    const def = (processDefinitions as any[]).find((p) => p.id === addingId);
    if (!def) return;
    setSteps((current) => [...current, { id: def.id, name: def.name }]);
    setAddingId('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Edit Route"
      description="Steps already completed or in progress are locked and stay as-is. Everything below is the remaining route — reorder, add, or remove steps, then save."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saveMutation.isPending}
            disabled={steps.length === 0 || !reason.trim()}
            onClick={() => saveMutation.mutate()}
          >
            Save Route
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {lockedTasks.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Locked (already done or in progress)</p>
            <div className="space-y-1">
              {lockedTasks
                .sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder)
                .map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-sm text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {t.processDefinition?.name}
                    <span className="ml-auto text-xs">{t.status}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Remaining steps (editable)</p>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No remaining steps — add at least one below.</p>
          ) : (
            <div className="space-y-1">
              {steps.map((step, index) => (
                <div key={`${step.id}-${index}`} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-foreground">{step.name}</span>
                  <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none px-1">↑</button>
                  <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none px-1">↓</button>
                  <button type="button" onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}
                    className="text-destructive hover:text-destructive/80 px-1"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="Add a step"
              value={addingId}
              onChange={(e) => setAddingId(e.target.value)}
              options={(processDefinitions as any[])
                .filter((p) => p.appliesTo === 'PART')
                .map((p) => ({ value: p.id, label: `${p.name} (${p.department?.name})` }))}
              placeholder="Select a process"
            />
          </div>
          <Button variant="secondary" onClick={addStep} disabled={!addingId}>Add</Button>
        </div>

        <Textarea
          label="Reason for change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer changed spec, skipping painting for this unit"
        />
      </div>
    </Modal>
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
