'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, GripVertical, Pencil, Trash2, Star } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function PriorityLevelsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6', isDefault: false });
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['priority-levels'],
    queryFn: () => api.priorityLevels.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing ? api.priorityLevels.update(editing.id, body) : api.priorityLevels.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priority-levels'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ name: '', color: '#3b82f6', isDefault: false });
      toast(editing ? 'Priority level updated' : 'Priority level created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.priorityLevels.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['priority-levels'] }); toast('Priority level deleted', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sortOrder: number }>) => api.priorityLevels.reorder(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['priority-levels'] }),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', color: '#3b82f6', isDefault: false }); setModalOpen(true); };
  const openEdit = (level: any) => { setEditing(level); setForm({ name: level.name, color: level.color ?? '#3b82f6', isDefault: level.isDefault }); setModalOpen(true); };

  const moveItem = (fromIndex: number, toIndex: number) => {
    const reordered = [...(levels as any[])];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    reorderMutation.mutate(reordered.map((l, i) => ({ id: l.id, sortOrder: i + 1 })));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Priority Levels"
        description="Configure task and order priority levels. These appear in all priority dropdowns across the application."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Priority</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (
          <Card className="overflow-hidden max-w-2xl">
            <div className="divide-y divide-border">
              {(levels as any[]).map((level, index) => (
                <div
                  key={level.id}
                  draggable
                  onDragStart={() => setDragging(level.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragging && dragging !== level.id) {
                      const fromIdx = (levels as any[]).findIndex((l) => l.id === dragging);
                      moveItem(fromIdx, index);
                    }
                    setDragging(null);
                  }}
                  className={cn('flex items-center gap-4 px-4 py-3 group transition-colors', dragging === level.id ? 'opacity-50' : 'hover:bg-accent/50')}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: level.color ?? '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{level.name}</p>
                      {level.isDefault && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <Star className="w-3 h-3 fill-yellow-400" /> Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">Sort order: {level.sortOrder}</p>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-md', level.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                    {level.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(level)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete ${level.name}?`)) deleteMutation.mutate(level.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Priority Level' : 'New Priority Level'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} disabled={!form.name} onClick={() => saveMutation.mutate({ ...form, sortOrder: (levels as any[]).length + 1 })}>
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Critical" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-10 h-8 rounded cursor-pointer border border-border bg-transparent" />
              <span className="text-sm text-muted-foreground font-mono">{form.color}</span>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded border-border" />
            <span className="text-sm text-foreground">Set as default priority</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
