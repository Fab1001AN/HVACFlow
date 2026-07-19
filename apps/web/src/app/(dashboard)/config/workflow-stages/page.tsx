'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, Card, Badge } from '@/components/shared';
import { ImpactWarningModal } from '@/components/shared/impact-warning-modal';
import { Plus, GripVertical, Pencil, Trash2, Workflow, Power, ArrowLeftRight, Flag } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

const EMPTY_FORM = { name: '', departmentId: '', requiredPermission: '', actionLabel: 'Advance', allowsBackward: false, isTerminal: false };

export default function WorkflowStagesConfigPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [dragging, setDragging] = useState<string | null>(null);
  const [pendingImpact, setPendingImpact] = useState<{ stage: any; impact: { unitsHere: number }; nextData: any } | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ['workflow-stages'],
    queryFn: () => api.workflowStages.list(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list({ isActive: true }),
    staleTime: Infinity,
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.permissions.list(),
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing ? api.workflowStages.update(editing.id, body) : api.workflowStages.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setPendingImpact(null);
      toast(editing ? 'Stage updated' : 'Stage created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.workflowStages.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workflow-stages'] }); toast('Stage deleted', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (stage: any) => api.workflowStages.update(stage.id, { isActive: !stage.isActive }),
    onSuccess: (_, stage) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages'] });
      toast(stage.isActive ? `${stage.name} deactivated` : `${stage.name} activated`, 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sortOrder: number }>) => api.workflowStages.reorder(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow-stages'] }),
  });

  const moveItem = (fromIdx: number, toIdx: number) => {
    const next = [...(stages as any[])];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    reorderMutation.mutate(next.map((s, i) => ({ id: s.id, sortOrder: i })));
  };

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setModalOpen(true); };
  const openEdit = (stage: any) => {
    setEditing(stage);
    setForm({
      name: stage.name,
      departmentId: stage.departmentId ?? '',
      requiredPermission: stage.requiredPermission,
      actionLabel: stage.actionLabel,
      allowsBackward: stage.allowsBackward,
      isTerminal: stage.isTerminal ?? false,
    });
    setModalOpen(true);
  };

  const buildPayload = () => ({
    ...form,
    departmentId: form.departmentId || undefined,
  });

  // Editing an existing stage (its department, required permission, etc.)
  // instantly changes what "advance" means for any unit currently
  // sitting on it - check what's actually at stake before saving.
  const handleSubmit = async () => {
    const payload = buildPayload();
    if (!editing) {
      saveMutation.mutate(payload);
      return;
    }
    setCheckingId(editing.id);
    try {
      const impact = await api.workflowStages.impact(editing.id);
      if (impact.unitsHere > 0) {
        setPendingImpact({ stage: editing, impact, nextData: payload });
      } else {
        saveMutation.mutate(payload);
      }
    } catch (err: any) {
      toast(err.message ?? 'Could not check impact', 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const handleToggleActive = async (stage: any) => {
    if (!stage.isActive) {
      toggleActiveMutation.mutate(stage);
      return;
    }
    setCheckingId(stage.id);
    try {
      const impact = await api.workflowStages.impact(stage.id);
      if (impact.unitsHere > 0) {
        setPendingImpact({ stage, impact, nextData: { isActive: false } });
      } else {
        toggleActiveMutation.mutate(stage);
      }
    } catch (err: any) {
      toast(err.message ?? 'Could not check impact', 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const confirmPendingImpact = () => {
    if (!pendingImpact) return;
    if (pendingImpact.nextData.isActive === false) {
      toggleActiveMutation.mutate(pendingImpact.stage);
      setPendingImpact(null);
    } else {
      saveMutation.mutate(pendingImpact.nextData);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Workflow Stages"
        description="Define your own pipeline - as many stages as you need, in whatever order, each with its own required permission. New, standalone infrastructure - doesn't affect the existing Engineering/Planner/Manager/Assembly flow yet."
        action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>New Stage</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : stages.length === 0 ? (
          <EmptyState
            icon={<Workflow className="w-10 h-10" />}
            title="No stages configured yet"
            description="Add your first stage - units will move through them in this order."
            action={<Button onClick={openCreate}>Add Stage</Button>}
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {(stages as any[]).map((stage: any, index: number) => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => setDragging(stage.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragging && dragging !== stage.id) {
                      const fromIdx = (stages as any[]).findIndex((s) => s.id === dragging);
                      moveItem(fromIdx, index);
                    }
                    setDragging(null);
                  }}
                  className={cn('flex items-center gap-4 px-4 py-3 group transition-colors', dragging === stage.id ? 'opacity-50' : 'hover:bg-accent/50')}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />
                  <span className="text-xs text-muted-foreground w-5 text-center tabular-nums flex-shrink-0">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{stage.name}</p>
                      {stage.allowsBackward && <Badge variant="outline"><ArrowLeftRight className="w-3 h-3" /> Reversible</Badge>}
                      {stage.isTerminal && <Badge variant="outline"><Flag className="w-3 h-3" /> Terminal</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stage.department?.name ?? 'Not department-specific'} · needs <span className="font-mono">{stage.requiredPermission}</span> · button says &ldquo;{stage.actionLabel}&rdquo;
                    </p>
                  </div>
                  <Badge variant="muted">{stage._count?.units ?? 0} unit(s) here</Badge>
                  <span className={cn('text-xs px-2 py-0.5 rounded-md', stage.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                    {stage.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="sm"
                      className={stage.isActive ? 'text-muted-foreground' : 'text-emerald-500'}
                      loading={checkingId === stage.id}
                      title={stage.isActive ? 'Deactivate' : 'Activate'}
                      onClick={() => handleToggleActive(stage)}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(stage)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button
                      variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete ${stage.name}?`)) deleteMutation.mutate(stage.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Stage' : 'New Stage'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending || checkingId === editing?.id} disabled={!form.name || !form.requiredPermission}
              onClick={handleSubmit}>
              {editing ? 'Save Changes' : 'Create Stage'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Stage Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Quality Sign-off" />
          <Select
            label="Department (optional)"
            value={form.departmentId}
            onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
            options={(departments as any[]).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Not tied to a specific department"
          />
          <Select
            label="Required permission"
            value={form.requiredPermission}
            onChange={(e) => setForm((f) => ({ ...f, requiredPermission: e.target.value }))}
            options={(permissions as any[]).map((p) => ({ value: p.code, label: `${p.code} — ${p.description}` }))}
            placeholder="Who's allowed to advance a unit out of this stage"
          />
          <Input label="Action button label" value={form.actionLabel} onChange={(e) => setForm((f) => ({ ...f, actionLabel: e.target.value }))} placeholder="Advance" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.allowsBackward} onChange={(e) => setForm((f) => ({ ...f, allowsBackward: e.target.checked }))} className="rounded border-border" />
            <span className="text-sm text-foreground">Allow sending a unit back to the previous stage from here</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isTerminal} onChange={(e) => setForm((f) => ({ ...f, isTerminal: e.target.checked }))} className="mt-0.5 rounded border-border" />
            <span className="text-sm text-foreground">
              Terminal stage (end of the line)
              <span className="block text-xs text-muted-foreground">A unit on a terminal stage is treated as finished — it drops off the active Director, Manager, Planner and Designing work lists.</span>
            </span>
          </label>
        </div>
      </Modal>

      <ImpactWarningModal
        open={!!pendingImpact}
        title={pendingImpact?.nextData.isActive === false ? `Deactivate ${pendingImpact?.stage.name}?` : `This stage is currently in use`}
        lines={[
          `${pendingImpact?.impact.unitsHere ?? 0} unit(s) are currently sitting on this stage.`,
          pendingImpact?.nextData.isActive === false
            ? 'Turning it off removes it from the active sequence - units here will need to be moved to a different stage manually (via admin override) before they can advance again.'
            : 'Changing its department, required permission, or other settings takes effect immediately for those units.',
        ]}
        confirming={saveMutation.isPending || toggleActiveMutation.isPending}
        onConfirm={confirmPendingImpact}
        onCancel={() => setPendingImpact(null)}
      />
    </div>
  );
}
