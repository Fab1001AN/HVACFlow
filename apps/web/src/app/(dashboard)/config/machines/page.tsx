'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function MachinesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '', departmentId: '' });
  const [filterDept, setFilterDept] = useState('');

  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.departments.list({ isActive: true }), staleTime: Infinity });
  const { data: machines = [], isLoading } = useQuery({
    queryKey: ['machines', filterDept],
    queryFn: () => api.machines.list({ departmentId: filterDept || undefined }),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing ? api.machines.update(editing.id, body) : api.machines.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ name: '', code: '', departmentId: '' });
      toast(editing ? 'Machine updated' : 'Machine created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.machines.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['machines'] }); toast('Machine deleted', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', departmentId: '' }); setModalOpen(true); };
  const openEdit = (m: any) => { setEditing(m); setForm({ name: m.name, code: m.code, departmentId: m.departmentId }); setModalOpen(true); };

  // Group machines by department
  const grouped = (machines as any[]).reduce((acc: Record<string, any[]>, m: any) => {
    const name = m.department?.name ?? 'Unassigned';
    if (!acc[name]) acc[name] = [];
    acc[name].push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Machines"
        description="Optional machine assignments for production tasks. Scoped to departments."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Machine</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
            options={(departments as any[]).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="All Departments" className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState title="No machines yet" icon={<Wrench className="w-10 h-10" />}
            action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Machine</Button>}
          />
        ) : (
          Object.entries(grouped).map(([deptName, deptMachines]) => (
            <div key={deptName}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{deptName}</h3>
              <Card className="overflow-hidden max-w-2xl">
                <div className="divide-y divide-border">
                  {(deptMachines as any[]).map((machine) => (
                    <div key={machine.id} className="flex items-center gap-4 px-4 py-3 group hover:bg-accent/50">
                      <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{machine.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{machine.code}</p>
                      </div>
                      <span className={cn('text-xs px-2 py-0.5 rounded-md', machine.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                        {machine.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(machine)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                          onClick={() => { if (confirm(`Delete ${machine.name}?`)) deleteMutation.mutate(machine.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Machine' : 'New Machine'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} disabled={!form.name || !form.code || !form.departmentId}
              onClick={() => saveMutation.mutate(form)}>
              {editing ? 'Save Changes' : 'Create Machine'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Machine Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Plasma Cutter 1" />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="PC1" />
          <Select label="Department" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
            options={(departments as any[]).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Select department"
          />
        </div>
      </Modal>
    </div>
  );
}
