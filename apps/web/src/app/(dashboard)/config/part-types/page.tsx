'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, Pencil, Package } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function PartTypesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '', sourceType: 'Fabricated' as 'Fabricated' | 'Vendor' });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['part-types'],
    queryFn: () => api.partTypes.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) =>
      editing ? api.partTypes.update(editing.id, body) : api.partTypes.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['part-types'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ name: '', code: '', sourceType: 'Fabricated' });
      toast(editing ? 'Part type updated' : 'Part type created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', sourceType: 'Fabricated' }); setModalOpen(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ name: item.name, code: item.code, sourceType: item.sourceType ?? 'Fabricated' }); setModalOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Part Types"
        description="Configure part types (Sheet Metal Panel, Coil Assembly, etc.). Each type can have its own process route."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Part Type</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (items as any[]).length === 0 ? (
          <EmptyState
            title="No part types yet"
            description="Define the types of parts that make up your units."
            icon={<Package className="w-10 h-10" />}
            action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Part Type</Button>}
          />
        ) : (
          <Card className="overflow-hidden max-w-2xl">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Code</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(items as any[]).map((item) => (
                  <tr key={item.id} className="group hover:bg-accent/50">
                    <td className="px-4 py-2.5 font-medium text-foreground">{item.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.code}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs px-2 py-0.5 rounded-md',
                        item.sourceType === 'Vendor' ? 'bg-amber-500/10 text-amber-600' : 'bg-secondary text-muted-foreground'
                      )}>
                        {item.sourceType === 'Vendor' ? 'Vendor' : 'Fabricated'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs px-2 py-0.5 rounded-md',
                        item.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                      )}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openEdit(item)}>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Part Type' : 'New Part Type'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.name || !form.code}
              onClick={() => saveMutation.mutate(form)}
            >
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Coil Assembly" />
          <Input label="Code" value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="COIL" />
          <Select
            label="Source"
            value={form.sourceType}
            onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as 'Fabricated' | 'Vendor' }))}
            options={[
              { value: 'Fabricated', label: 'Fabricated in-house (goes through process routing)' },
              { value: 'Vendor', label: 'Vendor-supplied (tracked as received/pending, no routing)' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
