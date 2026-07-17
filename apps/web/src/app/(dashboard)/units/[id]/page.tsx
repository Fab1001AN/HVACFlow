'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Select, Card, ProgressBar, Textarea, Badge } from '@/components/shared';
import { Plus, Package, ChevronRight, CheckCircle, Circle, Clock, AlertCircle, ExternalLink, MessageSquare, AlertTriangle, History, Workflow, Wrench, Truck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { cn, PART_STATUS_BG, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { TaskStatus, PartStatus } from '@hvacflow/shared-types';
import { useWsEvent, useSubscribeUnit } from '@/lib/websocket';

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [partForm, setPartForm] = useState({ partTypeId: '', identifier: '', quantity: 1 });
  const [comment, setComment] = useState('');
  const [delayComment, setDelayComment] = useState(false);

  useSubscribeUnit(id);

  const { data: unit, isLoading } = useQuery({
    queryKey: ['unit', id],
    queryFn: () => api.units.get(id),
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['unit', id, 'activity'],
    queryFn: () => api.units.activity(id),
  });

  const { data: reworks = [] } = useQuery({
    queryKey: ['unit', id, 'reworks'],
    queryFn: () => api.reworks.listByUnit(id),
  });
  const { data: shipments = [] } = useQuery({
    queryKey: ['unit', id, 'shipments'],
    queryFn: () => api.shipments.listByUnit(id),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
    enabled: hasPermission('rework:manage'),
    staleTime: 60_000,
  });

  const [reworkIssue, setReworkIssue] = useState('');
  const [reworkAssignee, setReworkAssignee] = useState('');
  const createReworkMutation = useMutation({
    mutationFn: () => api.reworks.create(id, { issue: reworkIssue, assignedToUserId: reworkAssignee || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setReworkIssue('');
      setReworkAssignee('');
      toast('Rework opened', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });
  const updateReworkMutation = useMutation({
    mutationFn: ({ reworkId, body }: { reworkId: string; body: any }) => api.reworks.update(reworkId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      toast('Rework updated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const [shipForm, setShipForm] = useState({ carrierName: '', shipDate: '', truckNumber: '', trackingNumber: '', driverName: '', notes: '' });
  const createShipmentMutation = useMutation({
    mutationFn: () => api.shipments.create(id, { ...shipForm, shipDate: shipForm.shipDate || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setShipForm({ carrierName: '', shipDate: '', truckNumber: '', trackingNumber: '', driverName: '', notes: '' });
      toast('Shipment logged', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });
  const updateShipmentMutation = useMutation({
    mutationFn: ({ shipmentId, body }: { shipmentId: string; body: any }) => api.shipments.update(shipmentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      toast('Shipment updated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const { data: partTypes } = useQuery({
    queryKey: ['part-types'],
    queryFn: () => api.partTypes.list({ isActive: true }),
    staleTime: Infinity,
  });

  // Live progress updates
  useWsEvent('unit.progressChanged', (payload) => {
    if (payload.unitId === id) {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
    }
  }, [id]);

  useWsEvent('part.progressChanged', () => {
    queryClient.invalidateQueries({ queryKey: ['unit', id] });
  }, [id]);

  const updateUnitMutation = useMutation({
    mutationFn: (body: any) => api.units.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      queryClient.invalidateQueries({ queryKey: ['units'] });
      toast('Unit updated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  // Backend already blocks this (ConflictException) if any task is
  // in progress or pending verification - real work in flight always
  // wins over "created by mistake." Soft delete (deletedAt), not a
  // hard delete - recoverable if this turns out to be the wrong call.
  const deleteUnitMutation = useMutation({
    mutationFn: () => api.units.delete(id),
    onSuccess: () => {
      toast('Unit deleted', 'success');
      router.push('/production-calendar');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  // Backend blocks this the same way (ConflictException) if the part
  // has any completed or in-progress task - a part that's actually
  // been worked on is never a "delete by mistake" case anymore.
  const deletePartMutation = useMutation({
    mutationFn: (partId: string) => api.parts.delete(partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      toast('Part deleted', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  // New generic workflow engine (Step 2) - standalone from the existing
  // Engineering/Planner/Manager/Assembly flow above. Exists here so it
  // can actually be exercised end to end, not just CRUD'd in
  // Configuration with no way to prove it moves a real unit.
  const { data: workflowStages = [] } = useQuery({
    queryKey: ['workflow-stages'],
    queryFn: () => api.workflowStages.list(),
  });
  const workflowAdvanceMutation = useMutation({
    mutationFn: () => api.units.workflowAdvance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      toast('Advanced to the next stage', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });
  const workflowMoveBackMutation = useMutation({
    mutationFn: () => api.units.workflowMoveBack(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      toast('Sent back to the previous stage', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });
  const [sendBackStageId, setSendBackStageId] = useState('');
  const [sendBackReason, setSendBackReason] = useState('');
  const workflowSendBackMutation = useMutation({
    mutationFn: () => api.units.workflowSendBack(id, sendBackStageId, sendBackReason),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setSendBackStageId('');
      setSendBackReason('');
      toast(`Sent back to ${updated.currentWorkflowStage?.name}`, 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });
  const [setStageId, setSetStageId] = useState('');
  const workflowSetStageMutation = useMutation({
    mutationFn: () => api.units.workflowSetStage(id, setStageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setSetStageId('');
      toast('Stage set (admin override)', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const commentMutation = useMutation({
    mutationFn: () => api.units.addComment(id, { message: comment, isDelay: delayComment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setComment('');
      setDelayComment(false);
      toast('Comment added', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const addPartMutation = useMutation({
    mutationFn: (body: any) => api.parts.create(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setAddPartOpen(false);
      setPartForm({ partTypeId: '', identifier: '', quantity: 1 });
      toast('Part added and tasks generated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!unit) return null;

  const progress = Number(unit.progressPercentage);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={unit.serialNumber}
        breadcrumbs={[
          { label: 'Production Calendar', href: '/production-calendar' },
          { label: unit.serialNumber },
        ]}
        action={
          <div className="flex items-center gap-2">
            {hasPermission('part:manage') && (
              <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddPartOpen(true)}>
                Add Part
              </Button>
            )}
            {hasPermission('unit:manage') && (
              <Button
                variant="destructive"
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                loading={deleteUnitMutation.isPending}
                onClick={() => {
                  if (confirm(`Delete unit ${unit.serialNumber}? This can't be undone from here - only do this if it was created by mistake.`)) {
                    deleteUnitMutation.mutate();
                  }
                }}
              >
                Delete Unit
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Unit summary card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{unit.unitType?.name}</span>
              <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', 'bg-muted text-muted-foreground')}>
                {unit.status}
              </span>
            </div>
            <span className="text-sm font-medium tabular-nums">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} size="md" />
          {unit.specifications && Object.keys(unit.specifications as object).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(unit.specifications as Record<string, string>).map(([k, v]) => (
                <div key={k}>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">{k}</span>
                  <p className="text-sm text-foreground mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Planning and engineering readiness */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Planning & file readiness</h2>
              {unit.oneDriveFolderUrl && <a href={unit.oneDriveFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open OneDrive <ExternalLink className="w-3.5 h-3.5" /></a>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['submittalReceived', 'Submittal received'],
                ['designComplete', 'Design complete'],
                ['drawingsAvailable', 'Drawings available'],
                ['programmingFilesComplete', 'Programming files complete'],
                ['cuttingProgramsAvailable', 'Cutting programs available'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm cursor-pointer hover:bg-accent/40">
                  <input type="checkbox" checked={Boolean(unit[key])} disabled={!hasPermission('unit:manage') || updateUnitMutation.isPending} onChange={(e) => updateUnitMutation.mutate({ [key]: e.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button variant={unit.isBlocked ? 'destructive' : 'outline'} size="sm" onClick={() => updateUnitMutation.mutate({ isBlocked: !unit.isBlocked, holdReason: unit.isBlocked ? '' : 'Awaiting update' })}>
                <AlertTriangle className="w-3.5 h-3.5" /> {unit.isBlocked ? 'Blocked' : 'Mark blocked'}
              </Button>
              {unit.currentDepartment?.name && <Badge variant="outline">Current: {unit.currentDepartment.name}</Badge>}
              {unit.currentStage && <Badge variant="muted">{unit.currentStage}</Badge>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4" /><h2 className="text-sm font-semibold">Comments & delay reasons</h2></div>
            <Textarea placeholder="Add production update, missing material, drawing issue, or hold reason..." value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={delayComment} onChange={(e) => setDelayComment(e.target.checked)} /> Mark as delay / blocker</label>
              <Button size="sm" loading={commentMutation.isPending} disabled={!comment.trim()} onClick={() => commentMutation.mutate()}>Add Comment</Button>
            </div>
            <div className="mt-4 max-h-52 overflow-y-auto space-y-2">
              {(unit.comments ?? []).map((item: any) => <div key={item.id} className={cn('rounded-md border border-border p-2.5', item.isDelay && 'border-amber-500/40 bg-amber-500/5')}><div className="flex justify-between gap-3 text-xs"><span className="font-medium">{item.user?.name}</span><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></div><p className="text-sm mt-1 whitespace-pre-wrap">{item.message}</p></div>)}
              {!unit.comments?.length && <p className="text-xs text-muted-foreground">No comments yet.</p>}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1"><Workflow className="w-4 h-4" /><h2 className="text-sm font-semibold">Workflow Engine (new)</h2></div>
            <p className="text-xs text-muted-foreground mb-4">Standalone from the pipeline above - only moves if this unit has been put on the new engine.</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">Current stage</span>
              <Badge variant={unit.currentWorkflowStage ? 'default' : 'muted'}>
                {unit.currentWorkflowStage?.name ?? 'Not on this engine yet'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              Real pipeline currently says: engineering={unit.engineeringStatus}, production={unit.productionReleaseStatus}
              {unit.assemblyStartedAt ? ', assembly started' : ''} — compare against the shadow stage above to verify they agree.
            </p>
            <div className="flex gap-2 mb-4">
              <Button size="sm" className="flex-1" loading={workflowAdvanceMutation.isPending} onClick={() => workflowAdvanceMutation.mutate()}>
                Advance
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" loading={workflowMoveBackMutation.isPending} onClick={() => workflowMoveBackMutation.mutate()}>
                Move Back
              </Button>
            </div>

            {/* QC-style: send to any earlier stage with a required
                reason, not just one step back. */}
            <div className="pt-3 border-t border-border mb-3">
              <p className="text-xs text-muted-foreground mb-2">Send back to a specific department (e.g. QC sending it back to Fabrication)</p>
              <div className="space-y-2">
                <Select
                  value={sendBackStageId}
                  onChange={(e) => setSendBackStageId(e.target.value)}
                  options={(workflowStages as any[])
                    .filter((s: any) => s.id !== unit.currentWorkflowStageId)
                    .map((s: any) => ({ value: s.id, label: s.name }))}
                  placeholder="Select a department to send back to"
                />
                <Textarea
                  placeholder="Reason (required) - what needs fixing"
                  value={sendBackReason}
                  onChange={(e) => setSendBackReason(e.target.value)}
                  rows={2}
                />
                <Button
                  size="sm" variant="secondary" className="w-full"
                  disabled={!sendBackStageId || !sendBackReason.trim()}
                  loading={workflowSendBackMutation.isPending}
                  onClick={() => workflowSendBackMutation.mutate()}
                >
                  Send Back
                </Button>
              </div>
            </div>
            {hasPermission('config:manage') && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Admin override - jump directly to any stage</p>
                <div className="flex gap-2">
                  <Select
                    value={setStageId}
                    onChange={(e) => setSetStageId(e.target.value)}
                    options={(workflowStages as any[]).map((s: any) => ({ value: s.id, label: s.name }))}
                    placeholder="Select a stage"
                    className="flex-1"
                  />
                  <Button size="sm" variant="secondary" disabled={!setStageId} loading={workflowSetStageMutation.isPending} onClick={() => workflowSetStageMutation.mutate()}>
                    Set
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {(hasPermission('rework:manage') || reworks.length > 0) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Wrench className="w-4 h-4" /><h2 className="text-sm font-semibold">Rework</h2></div>
              <p className="text-xs text-muted-foreground mb-4">Separate from the pipeline above - the unit's own completion is never reopened. This is a linked record for post-completion fixes.</p>

              {hasPermission('rework:manage') && (
                <div className="space-y-2 mb-4">
                  <Textarea placeholder="What's wrong / customer complaint" value={reworkIssue} onChange={(e) => setReworkIssue(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Select
                      value={reworkAssignee}
                      onChange={(e) => setReworkAssignee(e.target.value)}
                      options={(allUsers as any[]).map((u: any) => ({ value: u.id, label: u.name }))}
                      placeholder="Assign to (optional)"
                      className="flex-1"
                    />
                    <Button size="sm" disabled={!reworkIssue.trim()} loading={createReworkMutation.isPending} onClick={() => createReworkMutation.mutate()}>
                      Open Rework
                    </Button>
                  </div>
                </div>
              )}

              {reworks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rework records.</p>
              ) : (
                <div className="space-y-2">
                  {(reworks as any[]).map((r: any) => (
                    <div key={r.id} className={cn('rounded-md border p-3', r.status === 'Open' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border')}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant={r.status === 'Open' ? 'default' : 'muted'}>{r.status}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm">{r.issue}</p>
                      {r.assignedTo && <p className="text-xs text-muted-foreground mt-1">Assigned to {r.assignedTo.name}</p>}
                      {r.status === 'Open' && hasPermission('rework:manage') && (
                        <Button size="sm" variant="secondary" className="mt-2" loading={updateReworkMutation.isPending} onClick={() => updateReworkMutation.mutate({ reworkId: r.id, body: { status: 'Completed' } })}>
                          Mark Rework Completed
                        </Button>
                      )}
                      {r.completedAt && <p className="text-xs text-muted-foreground mt-1">Completed {new Date(r.completedAt).toLocaleDateString()}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {(hasPermission('shipment:manage') || shipments.length > 0) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4"><Truck className="w-4 h-4" /><h2 className="text-sm font-semibold">Shipping</h2></div>
              {hasPermission('shipment:manage') && (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <Input label="Carrier" value={shipForm.carrierName} onChange={(e) => setShipForm((f) => ({ ...f, carrierName: e.target.value }))} placeholder="e.g. XPO Logistics" />
                    <Input label="Ship date" type="date" value={shipForm.shipDate} onChange={(e) => setShipForm((f) => ({ ...f, shipDate: e.target.value }))} />
                    <Input label="Truck #" value={shipForm.truckNumber} onChange={(e) => setShipForm((f) => ({ ...f, truckNumber: e.target.value }))} />
                    <Input label="Tracking / BOL #" value={shipForm.trackingNumber} onChange={(e) => setShipForm((f) => ({ ...f, trackingNumber: e.target.value }))} />
                    <Input label="Driver" value={shipForm.driverName} onChange={(e) => setShipForm((f) => ({ ...f, driverName: e.target.value }))} className="col-span-2" />
                  </div>
                  <Textarea placeholder="Notes" value={shipForm.notes} onChange={(e) => setShipForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                  <Button size="sm" className="mt-2 w-full" loading={createShipmentMutation.isPending} onClick={() => createShipmentMutation.mutate()}>
                    Log Shipment
                  </Button>
                </>
              )}

              {shipments.length > 0 && (
                <div className="mt-4 space-y-2">
                  {(shipments as any[]).map((s: any) => (
                    <div key={s.id} className="rounded-md border border-border p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.carrierName ?? 'Carrier not set'}</span>
                        <span className="text-xs text-muted-foreground">{s.shipDate ? new Date(s.shipDate).toLocaleDateString() : 'No date'}</span>
                      </div>
                      {s.truckNumber && <p className="text-xs text-muted-foreground">Truck {s.truckNumber}</p>}
                      {s.trackingNumber && <p className="text-xs text-muted-foreground">Tracking/BOL {s.trackingNumber}</p>}
                      {s.driverName && <p className="text-xs text-muted-foreground">Driver: {s.driverName}</p>}
                      {!s.destinationConfirmed && hasPermission('shipment:manage') && (
                        <Button size="sm" variant="secondary" onClick={() => updateShipmentMutation.mutate({ shipmentId: s.id, body: { destinationConfirmed: true } })}>
                          Confirm destination
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4"><History className="w-4 h-4" /><h2 className="text-sm font-semibold">Activity timeline</h2></div>
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <div className="space-y-0 max-h-96 overflow-y-auto">
                {activity.map((entry: any, index: number) => (
                  <div key={entry.id} className="relative pl-6 pb-4">
                    {index < activity.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                    )}
                    <div className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 border-primary bg-card" />
                    <p className="text-sm text-foreground">{entry.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.user?.name ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Parts */}
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Parts <span className="text-muted-foreground">({unit.parts?.length ?? 0})</span></h2>
          {!unit.parts?.length ? (
            <EmptyState title="No parts yet" icon={<Package className="w-10 h-10" />} />
          ) : (
            <div className="space-y-2">
              {unit.parts.map((part: any) => (
                <PartRow
                  key={part.id}
                  part={part}
                  onTaskClick={setSelectedTaskId}
                  onDelete={(partId) => deletePartMutation.mutate(partId)}
                  canDelete={hasPermission('part:manage')}
                  deleting={deletePartMutation.isPending && deletePartMutation.variables === part.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Unit-level tasks (Testing, Dispatch) */}
        {unit.tasks && unit.tasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">Unit Tasks</h2>
            <Card>
              <div className="divide-y divide-border">
                {unit.tasks.map((task: any) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <TaskStatusIcon status={task.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.processDefinition?.name}</p>
                      <p className="text-xs text-muted-foreground">{task.department?.name}</p>
                    </div>
                    <StatusBadge status={task.status} />
                    {task.assignedUser && (
                      <span className="text-xs text-muted-foreground">{task.assignedUser.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Add Part Modal */}
      <Modal open={addPartOpen} onClose={() => setAddPartOpen(false)} title="Add Part"
        description="Select a part type to add. Production tasks will be generated automatically."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddPartOpen(false)}>Cancel</Button>
            <Button loading={addPartMutation.isPending} disabled={!partForm.partTypeId || !partForm.identifier}
              onClick={() => addPartMutation.mutate(partForm)}>
              Add Part
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select label="Part Type" value={partForm.partTypeId}
            onChange={(e) => setPartForm((f) => ({ ...f, partTypeId: e.target.value }))}
            options={partTypes?.map((pt: any) => ({ value: pt.id, label: pt.name })) ?? []}
            placeholder="Select part type"
          />
          <Input label="Identifier / Tag" value={partForm.identifier}
            onChange={(e) => setPartForm((f) => ({ ...f, identifier: e.target.value }))}
            placeholder="COIL-01"
          />
          <Input label="Quantity" type="number" min={1} value={partForm.quantity}
            onChange={(e) => setPartForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
          />
        </div>
      </Modal>

      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}

function PartRow({ part, onTaskClick, onDelete, canDelete, deleting }: { part: any; onTaskClick: (id: string) => void; onDelete: (partId: string) => void; canDelete: boolean; deleting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const progress = Number(part.progressPercentage);

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform flex-shrink-0', expanded && 'rotate-90')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{part.partType?.name}</span>
            <span className="text-xs text-muted-foreground font-mono">{part.identifier}</span>
          </div>
          <ProgressBar value={progress} showLabel size="sm" />
        </div>
        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium flex-shrink-0', PART_STATUS_BG[part.status as PartStatus] ?? 'bg-muted text-muted-foreground')}>
          {part.status}
        </span>
        {canDelete && (
          <button
            type="button"
            title="Delete this part"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete part ${part.partType?.name} (${part.identifier})? Only do this if it was added by mistake.`)) {
                onDelete(part.id);
              }
            }}
            className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {expanded && part.tasks && (
        <div className="border-t border-border divide-y divide-border">
          {part.tasks.map((task: any) => (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left pl-10"
            >
              <TaskStatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{task.processDefinition?.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{task.department?.name}</span>
              </div>
              <StatusBadge status={task.status} />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  if (status === TaskStatus.Completed) return <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />;
  if (status === TaskStatus.InProgress) return <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 animate-pulse" />;
  if (status === TaskStatus.Rejected) return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  return <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}
