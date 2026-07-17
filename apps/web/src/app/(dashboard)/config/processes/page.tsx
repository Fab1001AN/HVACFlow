'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, Card } from '@/components/shared';
import { ImpactWarningModal } from '@/components/shared/impact-warning-modal';
import { Plus, Pencil, Trash2, Cpu, CheckSquare, Shield } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';
import { AppliesTo } from '@hvacflow/shared-types';

const EMPTY_FORM = {
  name: '', code: '', departmentId: '', appliesTo: AppliesTo.PART as AppliesTo,
  requiresChecklist: false, requiresVerification: false, isOptional: false,
  defaultEstimatedMinutes: '', defaultPriorityLevelId: '', weight: '1.0',
};

export default function ProcessesConfigPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showArchived, setShowArchived] = useState(false);
  const [pendingImpact, setPendingImpact] = useState<{ activeTaskCount: number; affectedUnitCount: number } | null>(null);
  const [checkingImpact, setCheckingImpact] = useState(false);

  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['process-definitions'],
    queryFn: () => api.processDefinitions.list(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list({ isActive: true }),
    staleTime: Infinity,
  });

  const { data: priorities = [] } = useQuery({
    queryKey: ['priority-levels'],
    queryFn: () => api.priorityLevels.list({ isActive: true }),
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing
      ? api.processDefinitions.update(editing.id, body)
      : api.processDefinitions.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-definitions'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setPendingImpact(null);
      toast(editing ? 'Process updated' : 'Process created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.processDefinitions.delete(id),
    onSuccess: (result: any) => { queryClient.invalidateQueries({ queryKey: ['process-definitions'] }); toast(result?.archived ? 'Process archived because it has history' : 'Process deleted', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setModalOpen(true); };
  const openEdit = (proc: any) => {
    setEditing(proc);
    setForm({
      name: proc.name, code: proc.code, departmentId: proc.departmentId,
      appliesTo: proc.appliesTo, requiresChecklist: proc.requiresChecklist,
      requiresVerification: proc.requiresVerification, isOptional: proc.isOptional,
      defaultEstimatedMinutes: proc.defaultEstimatedMinutes?.toString() ?? '',
      defaultPriorityLevelId: proc.defaultPriorityLevelId ?? '',
      weight: proc.weight?.toString() ?? '1.0',
    });
    setModalOpen(true);
  };

  const buildPayload = () => ({
    ...form,
    defaultEstimatedMinutes: form.defaultEstimatedMinutes ? parseInt(form.defaultEstimatedMinutes) : undefined,
    defaultPriorityLevelId: form.defaultPriorityLevelId || undefined,
    weight: parseFloat(form.weight) || 1.0,
  });

  // Editing an EXISTING process takes effect instantly for every task
  // currently referencing it (live join, not a snapshot) - check what's
  // actually at stake before saving, rather than after something on the
  // shop floor has already been quietly changed underneath someone.
  // Creating a brand new process has nothing to check - nothing
  // references it yet.
  const handleSubmit = async () => {
    if (!editing) {
      saveMutation.mutate(buildPayload());
      return;
    }
    setCheckingImpact(true);
    try {
      const impact = await api.processDefinitions.impact(editing.id);
      if (impact.activeTaskCount > 0) {
        setPendingImpact(impact);
      } else {
        saveMutation.mutate(buildPayload());
      }
    } catch (err: any) {
      toast(err.message ?? 'Could not check impact', 'error');
    } finally {
      setCheckingImpact(false);
    }
  };

  // Group by department. Archived processes stay recoverable but are hidden by default.
  const visibleProcesses = showArchived ? processes : (processes as any[]).filter((proc: any) => proc.isActive);
  const grouped = (visibleProcesses as any[]).reduce((acc: Record<string, any[]>, proc: any) => {
    const deptName = proc.department?.name ?? 'Unassigned';
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(proc);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Process Definitions"
        description="Every manufacturing operation. No process names are hardcoded — add any new process here."
        action={<div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label><Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Process</Button></div>}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState title="No processes yet" icon={<Cpu className="w-10 h-10" />}
            action={<div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label><Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Process</Button></div>}
          />
        ) : (
          Object.entries(grouped).map(([deptName, procs]) => (
            <div key={deptName}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">{deptName}</h3>
              <Card className="overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col />
                    <col className="w-28" />
                    <col className="w-16" />
                    <col className="w-20" />
                    <col className="w-20" />
                    <col className="w-16" />
                    <col className="w-16" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Applies To</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Verify</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Checklist</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Optional</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Weight</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Est.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(procs as any[]).map((proc) => (
                      <tr key={proc.id} className="hover:bg-accent/50 group">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-1.5 h-1.5 rounded-full', proc.isActive ? 'bg-green-400' : 'bg-muted-foreground')} />
                            <span className="font-medium text-foreground">{proc.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{proc.code}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                            proc.appliesTo === 'PART' ? 'bg-blue-500/10 text-blue-400' : 'bg-violet-500/10 text-violet-400'
                          )}>
                            {proc.appliesTo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {proc.requiresVerification ? <Shield className="w-3.5 h-3.5 text-orange-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {proc.requiresChecklist ? <CheckSquare className="w-3.5 h-3.5 text-blue-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">{proc.isOptional ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{Number(proc.weight ?? 1).toFixed(1)}×</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{proc.defaultEstimatedMinutes ? `${proc.defaultEstimatedMinutes}m` : '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(proc)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => api.processDefinitions.update(proc.id, { isActive: !proc.isActive }).then(() => queryClient.invalidateQueries({ queryKey: ['process-definitions'] })).catch((err: any) => toast(err.message, 'error'))}>{proc.isActive ? 'Disable' : 'Enable'}</Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                              onClick={() => { if (confirm(`${proc.isActive ? 'Remove' : 'Delete'} ${proc.name}? Processes with history will be archived safely.`)) deleteMutation.mutate(proc.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editing ? 'Edit Process' : 'New Process Definition'}
        description="Process definitions drive the entire task engine. Each row here = one possible manufacturing operation."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending || checkingImpact} disabled={!form.name || !form.code || !form.departmentId}
              onClick={handleSubmit}>
              {editing ? 'Save Changes' : 'Create Process'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Process Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cutting" />
            <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CUT" />
          </div>
          <Select label="Department" value={form.departmentId}
            onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
            options={(departments as any[]).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Select department"
          />
          <Select label="Applies To" value={form.appliesTo}
            onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value as AppliesTo }))}
            options={[{ value: AppliesTo.PART, label: 'Part (most operations)' }, { value: AppliesTo.UNIT, label: 'Unit (Testing, Dispatch)' }]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Default Est. Minutes" type="number" min={1} value={form.defaultEstimatedMinutes}
              onChange={(e) => setForm((f) => ({ ...f, defaultEstimatedMinutes: e.target.value }))} placeholder="30" />
            <Input label="Progress Weight" type="number" min={0.1} step={0.1} value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="1.0" />
          </div>
          <Select label="Default Priority" value={form.defaultPriorityLevelId}
            onChange={(e) => setForm((f) => ({ ...f, defaultPriorityLevelId: e.target.value }))}
            options={(priorities as any[]).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Inherit from order"
          />
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresVerification}
                onChange={(e) => setForm((f) => ({ ...f, requiresVerification: e.target.checked }))}
                className="rounded border-border" />
              <span className="text-sm text-foreground">Requires verification</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isOptional} onChange={(e) => setForm((f) => ({ ...f, isOptional: e.target.checked }))} className="rounded border-border" /><span className="text-sm text-foreground">Optional process</span></label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requiresChecklist}
                onChange={(e) => setForm((f) => ({ ...f, requiresChecklist: e.target.checked }))}
                className="rounded border-border" />
              <span className="text-sm text-foreground">Requires checklist</span>
            </label>
          </div>
        </div>
      </Modal>

      <ImpactWarningModal
        open={!!pendingImpact}
        title="This process is currently in use"
        lines={[
          `${pendingImpact?.activeTaskCount ?? 0} active task(s) across ${pendingImpact?.affectedUnitCount ?? 0} unit(s) reference this process right now.`,
          'Saving this change takes effect immediately for that work in progress - if you\'re changing checklist or verification requirements, tasks already underway will be held to the new rules straight away.',
        ]}
        confirming={saveMutation.isPending}
        onConfirm={() => saveMutation.mutate(buildPayload())}
        onCancel={() => setPendingImpact(null)}
      />
    </div>
  );
}
