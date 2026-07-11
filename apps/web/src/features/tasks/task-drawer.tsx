'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TaskStatus } from '@hvacflow/shared-types';
import { cn, STATUS_LABELS, STATUS_BG, formatDateTime, formatTime, formatDuration, getElapsed } from '@/lib/utils';
import { Drawer, Button, Textarea, Badge } from '@/components/shared';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { Avatar, Spinner } from '@/components/shared';
import { CheckSquare, Square, Clock, User, Cpu, Wrench, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/shared';
import { useWsEvent, useSubscribeTask } from '@/lib/websocket';

interface TaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const [note, setNote] = useState('');
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuthStore();

  useSubscribeTask(taskId);

  const { data: task, isLoading, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.tasks.get(taskId!),
    enabled: !!taskId,
  });

  // Live updates via WebSocket
  useWsEvent('task.statusChanged', (payload) => {
    if (payload.taskId === taskId) {
      queryClient.setQueryData(['task', taskId], payload.task);
    }
  }, [taskId]);

  useWsEvent('checklist.updated', (payload) => {
    if (payload.taskId === taskId) {
      refetch();
    }
  }, [taskId]);

  // Mutations for task actions
  const startMutation = useMutation({
    mutationFn: () => api.tasks.start(taskId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      toast('Task started', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.tasks.complete(taskId!, { note }),
    onSuccess: (data) => {
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      setNote('');
      toast('Task completed', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.tasks.verify(taskId!, { note }),
    onSuccess: (data) => {
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      setNote('');
      toast('Task verified and completed', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const holdMutation = useMutation({
    mutationFn: () => api.tasks.hold(taskId!, note),
    onSuccess: (data) => {
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      setNote('');
      setShowNoteFor(null);
      toast('Task placed on hold', 'info');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.tasks.resume(taskId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['task', taskId], data);
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      toast('Task resumed', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.tasks.reject(taskId!, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['mission-control'] });
      setNote('');
      setShowNoteFor(null);
      toast('Task rejected', 'error');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const checklistMutation = useMutation({
    mutationFn: ({ responseId, isChecked }: { responseId: string; isChecked: boolean }) =>
      api.tasks.toggleChecklist(taskId!, responseId, isChecked),
    onSuccess: () => refetch(),
    onError: (err: any) => toast(err.message, 'error'),
  });

  const noteUpdateMutation = useMutation({
    mutationFn: (notes: string) => api.tasks.update(taskId!, { notes }),
    onSuccess: () => toast('Notes saved', 'success'),
    onError: (err: any) => toast(err.message, 'error'),
  });

  const drawerTitle = task
    ? `${task.processDefinition?.name} — ${task.part?.unit?.serialNumber ?? task.unit?.serialNumber ?? ''}`
    : 'Task Detail';

  return (
    <Drawer open={!!taskId} onClose={onClose} title={drawerTitle} width="w-full max-w-xl">
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner className="w-6 h-6" />
        </div>
      ) : !task ? null : (
        <div className="flex flex-col h-full">
          {/* ─── Task metadata ─────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3 border-b border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={task.status} />
              <PriorityDot color={task.priorityLevel?.color} name={task.priorityLevel?.name} showLabel />
              <span className="text-xs text-muted-foreground">{task.department?.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Unit</span>
                <p className="text-foreground font-medium mt-0.5">
                  {task.part?.unit?.serialNumber ?? task.unit?.serialNumber ?? '—'}
                </p>
              </div>
              {task.part && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Part</span>
                  <p className="text-foreground font-medium mt-0.5">
                    {task.part.partType?.name} — {task.part.identifier}
                  </p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Assigned</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {task.assignedUser ? (
                    <>
                      <Avatar name={task.assignedUser.name} size="xs" />
                      <span className="text-foreground">{task.assignedUser.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </div>
              </div>
              {task.machine && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Machine</span>
                  <p className="text-foreground mt-0.5">{task.machine.name}</p>
                </div>
              )}
              {task.startedAt && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Started</span>
                  <p className="text-foreground mt-0.5">{formatTime(task.startedAt)}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Duration</span>
                <p className="text-foreground mt-0.5">
                  {task.actualDurationMinutes
                    ? formatDuration(task.actualDurationMinutes)
                    : task.startedAt && task.status === TaskStatus.InProgress
                    ? <span className="text-yellow-400">{getElapsed(task.startedAt)}</span>
                    : task.estimatedDurationMinutes
                    ? `Est. ${formatDuration(task.estimatedDurationMinutes)}`
                    : '—'}
                </p>
              </div>
              {task.verifiedByUser && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Verified by</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Avatar name={task.verifiedByUser.name} size="xs" />
                    <span className="text-foreground">{task.verifiedByUser.name}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Checklist ─────────────────────────────────────────── */}
          {task.checklistResponses && task.checklistResponses.length > 0 && (
            <div className="px-5 py-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Checklist</h3>
                <span className="text-xs text-muted-foreground">
                  {task.checklistResponses.filter((r: any) => r.isChecked).length}/{task.checklistResponses.length}
                </span>
              </div>
              <div className="space-y-2">
                {task.checklistResponses.map((response: any) => {
                  const canCheck = task.status === TaskStatus.InProgress && hasPermission('task:complete');
                  return (
                    <button
                      key={response.id}
                      disabled={!canCheck || checklistMutation.isPending}
                      onClick={() => canCheck && checklistMutation.mutate({
                        responseId: response.id,
                        isChecked: !response.isChecked,
                      })}
                      className={cn(
                        'w-full flex items-start gap-3 p-2.5 rounded-md text-left transition-colors',
                        canCheck ? 'hover:bg-accent cursor-pointer' : 'cursor-default',
                        response.isChecked && 'bg-green-500/5',
                      )}
                    >
                      {response.isChecked ? (
                        <CheckSquare className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className={cn('text-sm', response.isChecked ? 'text-muted-foreground line-through' : 'text-foreground')}>
                          {response.checklistItemTemplate.label}
                        </span>
                        {response.checklistItemTemplate.isRequired && !response.isChecked && (
                          <span className="ml-1.5 text-xs text-orange-400">required</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Notes ─────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">Notes</h3>
            <textarea
              defaultValue={task.notes ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (task.notes ?? '')) {
                  noteUpdateMutation.mutate(e.target.value);
                }
              }}
              rows={2}
              placeholder="Add notes…"
              className="w-full px-3 py-2 rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* ─── History ─────────────────────────────────────────────── */}
          {task.statusHistory && task.statusHistory.length > 0 && (
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-foreground mb-3">History</h3>
              <div className="space-y-2">
                {task.statusHistory.slice(-5).map((h: any) => (
                  <div key={h.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground w-16 flex-shrink-0 tabular-nums">
                      {formatTime(h.changedAt)}
                    </span>
                    <div className="flex-1">
                      <span className="text-muted-foreground">{h.fromStatus ?? 'Created'}</span>
                      <ChevronRight className="w-3 h-3 inline mx-1 text-muted-foreground" />
                      <span className="text-foreground font-medium">{STATUS_LABELS[h.toStatus as TaskStatus]}</span>
                      <span className="text-muted-foreground ml-1">by {h.changedBy?.name}</span>
                      {h.note && <p className="text-muted-foreground italic mt-0.5">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Note input for hold/reject ───────────────────────── */}
          {showNoteFor && (
            <div className="px-5 py-3 bg-muted/30 border-b border-border">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Reason for ${showNoteFor}…`}
                rows={2}
                autoFocus
                className="w-full px-3 py-2 rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          )}

          {/* ─── Actions ───────────────────────────────────────────── */}
          <div className="px-5 py-4 mt-auto border-t border-border space-y-2">
            {/* Primary action */}
            {task.status === TaskStatus.Ready && hasPermission('task:start') && (
              <Button
                className="w-full"
                size="lg"
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                Start Task
              </Button>
            )}

            {task.status === TaskStatus.InProgress && hasPermission('task:complete') && (
              <Button
                className="w-full"
                size="lg"
                loading={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                Complete Task
              </Button>
            )}

            {task.status === TaskStatus.PendingVerification && hasPermission('task:verify') && (
              <Button
                className="w-full"
                size="lg"
                loading={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate()}
              >
                Verify &amp; Complete
              </Button>
            )}

            {task.status === TaskStatus.OnHold && hasPermission('task:hold') && (
              <Button
                className="w-full"
                size="lg"
                variant="secondary"
                loading={resumeMutation.isPending}
                onClick={() => resumeMutation.mutate()}
              >
                Resume Task
              </Button>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2">
              {[TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification].includes(task.status) && hasPermission('task:hold') && (
                showNoteFor === 'hold' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={!note.trim()}
                    loading={holdMutation.isPending}
                    onClick={() => holdMutation.mutate()}
                  >
                    Confirm Hold
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setShowNoteFor('hold'); setNote(''); }}
                  >
                    Hold
                  </Button>
                )
              )}

              {[TaskStatus.Ready, TaskStatus.InProgress, TaskStatus.PendingVerification].includes(task.status) && hasPermission('task:reject') && (
                showNoteFor === 'reject' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={!note.trim()}
                    loading={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                  >
                    Confirm Reject
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
                    onClick={() => { setShowNoteFor('reject'); setNote(''); }}
                  >
                    Reject
                  </Button>
                )
              )}

              {showNoteFor && (
                <Button variant="ghost" size="sm" onClick={() => { setShowNoteFor(null); setNote(''); }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
