'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, Pencil, Box, Package } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

function CatalogPage({
  title,
  description,
  icon: Icon,
  queryKey,
  fetchFn,
  createFn,
  updateFn,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  queryKey: string[];
  fetchFn: () => Promise<any[]>;
  createFn: (body: any) => Promise<any>;
  updateFn: (id: string, body: any) => Promise<any>;
}) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '' });

  const { data: items = [], isLoading } = useQuery({ queryKey, queryFn: fetchFn });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing ? updateFn(editing.id, body) : createFn(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setModalOpen(false);
      setEditing(null);
      setForm({ name: '', code: '' });
      toast(editing ? `${title.slice(0, -1)} updated` : `${title.slice(0, -1)} created`, 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '' }); setModalOpen(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ name: item.name, code: item.code }); setModalOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={title} description={description}
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (items as any[]).length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} icon={<Icon className="w-10 h-10" />}
            action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New</Button>}
          />
        ) : (
          <Card className="overflow-hidden max-w-2xl">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(items as any[]).map((item) => (
                  <tr key={item.id} className="group hover:bg-accent/50">
                    <td className="px-4 py-2.5 font-medium text-foreground">{item.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.code}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs px-2 py-0.5 rounded-md', item.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => openEdit(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} disabled={!form.name || !form.code} onClick={() => saveMutation.mutate(form)}>
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </div>
      </Modal>
    </div>
  );
}

function UnitTypesPage() {
  return (
    <CatalogPage
      title="Unit Types"
      description="Configure HVAC unit types (RTU, AHU, etc.). Each type drives part composition and routing."
      icon={Box}
      queryKey={['unit-types']}
      fetchFn={() => api.unitTypes.list()}
      createFn={(body) => api.unitTypes.create(body)}
      updateFn={(id, body) => api.unitTypes.update(id, body)}
    />
  );
}

function PartTypesPage() {
  return (
    <CatalogPage
      title="Part Types"
      description="Configure part types (Sheet Metal Panel, Coil Assembly, etc.). Each type can have a process route."
      icon={Package}
      queryKey={['part-types']}
      fetchFn={() => api.partTypes.list()}
      createFn={(body) => api.partTypes.create(body)}
      updateFn={(id, body) => api.partTypes.update(id, body)}
    />
  );
}

export default UnitTypesPage;
