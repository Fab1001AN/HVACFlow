'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, EmptyState, Spinner, Card } from '@/components/shared';
import { ImpactWarningModal } from '@/components/shared/impact-warning-modal';
import { Plus, GripVertical, Pencil, Trash2, Building2, Power } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function DepartmentsConfigPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '', color: '#6366f1' });
  const [dragging, setDragging] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<{ dept: any; impact: { activeTaskCount: number; unitsCurrentlyHere: number } } | null>(null);
  const [checkingImpactId, setCheckingImpactId] = useState<string | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing ? api.departments.update(editing.id, body) : api.departments.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ name: '', code: '', color: '#6366f1' });
      toast(editing ? 'Department updated' : 'Department created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (dept: any) => api.departments.update(dept.id, { isActive: !dept.isActive }),
    onSuccess: (_, dept) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setPendingToggle(null);
      toast(dept.isActive ? `${dept.name} deactivated` : `${dept.name} activated`, 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  // Turning a department OFF changes real behavior instantly wherever
  // the app checks isActive (e.g. Assembly's vendor-part fallback when
  // Purchasing is off) - check what's actually running through it right
  // now before flipping the switch. Turning one ON is always safe, no
  // check needed.
  const handleToggleActive = async (dept: any) => {
    if (!dept.isActive) {
      toggleActiveMutation.mutate(dept);
      return;
    }
    setCheckingImpactId(dept.id);
    try {
      const impact = await api.departments.impact(dept.id);
      if (impact.activeTaskCount > 0 || impact.unitsCurrentlyHere > 0) {
        setPendingToggle({ dept, impact });
      } else {
        toggleActiveMutation.mutate(dept);
      }
    } catch (err: any) {
      toast(err.message ?? 'Could not check impact', 'error');
    } finally {
      setCheckingImpactId(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.departments.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['departments'] }); toast('Department deleted', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sortOrder: number }>) => api.departments.reorder(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', color: '#6366f1' }); setModalOpen(true); };
  const openEdit = (dept: any) => { setEditing(dept); setForm({ name: dept.name, code: dept.code, color: dept.color ?? '#6366f1' }); setModalOpen(true); };

  const moveItem = (fromIndex: number, toIndex: number) => {
    const reordered = [...departments];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    reorderMutation.mutate(reordered.map((d, i) => ({ id: d.id, sortOrder: i })));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Departments"
        description="Configure departments and their Kanban column order. Drag to reorder."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Department</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : departments.length === 0 ? (
          <EmptyState title="No departments yet" icon={<Building2 className="w-10 h-10" />}
            action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Department</Button>}
          />
        ) : (
          <Card className="overflow-hidden max-w-2xl">
            <div className="divide-y divide-border">
              {(departments as any[]).map((dept, index) => (
                <div
                  key={dept.id}
                  draggable
                  onDragStart={() => setDragging(dept.id)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={() => {
                    if (dragging && dragging !== dept.id) {
                      const fromIdx = (departments as any[]).findIndex((d) => d.id === dragging);
                      moveItem(fromIdx, index);
                    }
                    setDragging(null);
                  }}
                  className={cn('flex items-center gap-4 px-4 py-3 group transition-colors', dragging === dept.id ? 'opacity-50' : 'hover:bg-accent/50')}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color ?? '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{dept.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{dept.code}</p>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-md', dept.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                    {dept.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={dept.isActive ? 'text-muted-foreground' : 'text-emerald-500'}
                      loading={checkingImpactId === dept.id}
                      title={dept.isActive ? 'Deactivate' : 'Activate'}
                      onClick={() => handleToggleActive(dept)}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(dept)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete ${dept.name}?`)) deleteMutation.mutate(dept.id); }}>
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
        title={editing ? 'Edit Department' : 'New Department'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} disabled={!form.name || !form.code}
              onClick={() => saveMutation.mutate(form)}>
              {editing ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Department Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Fabrication" />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="FAB" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Kanban Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-10 h-8 rounded cursor-pointer border border-border bg-transparent" />
              <span className="text-sm text-muted-foreground font-mono">{form.color}</span>
            </div>
          </div>
        </div>
      </Modal>

      <ImpactWarningModal
        open={!!pendingToggle}
        title={`Deactivate ${pendingToggle?.dept.name}?`}
        lines={[
          `${pendingToggle?.impact.activeTaskCount ?? 0} active task(s) and ${pendingToggle?.impact.unitsCurrentlyHere ?? 0} unit(s) are currently in this department.`,
          'Turning it off changes behavior immediately wherever the app checks whether this department is active - for example, Assembly\'s vendor-parts fallback only appears once Purchasing is off.',
        ]}
        confirming={toggleActiveMutation.isPending}
        onConfirm={() => pendingToggle && toggleActiveMutation.mutate(pendingToggle.dept)}
        onCancel={() => setPendingToggle(null)}
      />
    </div>
  );
}
