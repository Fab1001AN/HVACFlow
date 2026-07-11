'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Select, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, Pencil, Trash2, Sliders, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function CompositionPage() {
  const queryClient = useQueryClient();
  const [selectedUnitTypeId, setSelectedUnitTypeId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ partTypeId: '', defaultQuantity: 1, isOptional: false });

  const { data: unitTypes = [] } = useQuery({ queryKey: ['unit-types'], queryFn: () => api.unitTypes.list({ isActive: true }), staleTime: Infinity });
  const { data: partTypes = [] } = useQuery({ queryKey: ['part-types'], queryFn: () => api.partTypes.list({ isActive: true }), staleTime: Infinity });

  const { data: composition = [], isLoading } = useQuery({
    queryKey: ['composition', selectedUnitTypeId],
    queryFn: () => api.unitTypes.getComposition(selectedUnitTypeId),
    enabled: !!selectedUnitTypeId,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing
      ? api.unitTypes.updateComposition(editing.id, body)
      : api.unitTypes.addComposition(selectedUnitTypeId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['composition', selectedUnitTypeId] });
      setModalOpen(false);
      setEditing(null);
      setForm({ partTypeId: '', defaultQuantity: 1, isOptional: false });
      toast(editing ? 'Composition updated' : 'Part added to composition', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.unitTypes.deleteComposition(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['composition', selectedUnitTypeId] }); toast('Part removed from composition', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openAdd = () => { setEditing(null); setForm({ partTypeId: '', defaultQuantity: 1, isOptional: false }); setModalOpen(true); };
  const openEdit = (entry: any) => {
    setEditing(entry);
    setForm({ partTypeId: entry.partTypeId, defaultQuantity: entry.defaultQuantity, isOptional: entry.isOptional });
    setModalOpen(true);
  };

  const selectedTypeName = (unitTypes as any[]).find((t) => t.id === selectedUnitTypeId)?.name ?? '';
  const existingPartIds = (composition as any[]).map((c) => c.partTypeId);
  const availablePartTypes = editing
    ? partTypes
    : (partTypes as any[]).filter((pt) => !existingPartIds.includes(pt.id));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Unit Composition"
        description="Define which part types make up each unit type. Parts are auto-generated when a unit is created."
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Unit Type:</span>
            <div className="flex-1 max-w-xs">
              <Select value={selectedUnitTypeId} onChange={(e) => setSelectedUnitTypeId(e.target.value)}
                options={(unitTypes as any[]).map((t) => ({ value: t.id, label: t.name }))}
                placeholder="Select a unit type…"
              />
            </div>
          </div>
        </Card>

        {!selectedUnitTypeId ? (
          <EmptyState title="Select a unit type" description="Choose a unit type above to configure its part composition." icon={<Sliders className="w-10 h-10" />} />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32"><Spinner className="w-6 h-6" /></div>
        ) : (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Parts in <span className="text-primary">{selectedTypeName}</span>
              </h3>
              <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openAdd}>Add Part</Button>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Required parts are auto-created when a unit is created. Optional parts are confirmed by the operator.
            </div>

            {(composition as any[]).length === 0 ? (
              <Card className="flex items-center justify-center h-24 border-dashed">
                <span className="text-sm text-muted-foreground">No parts configured — add the first part type</span>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Part Type</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Required</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(composition as any[]).map((entry) => (
                      <tr key={entry.id} className="group hover:bg-accent/50">
                        <td className="px-4 py-2.5 font-medium text-foreground">{entry.partType?.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{entry.defaultQuantity}×</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-xs px-2 py-0.5 rounded', entry.isOptional ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                            {entry.isOptional ? 'Optional' : 'Required'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                              onClick={() => { if (confirm('Remove this part from composition?')) deleteMutation.mutate(entry.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Composition Entry' : 'Add Part to Composition'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saveMutation.isPending} disabled={!form.partTypeId}
              onClick={() => saveMutation.mutate(form)}>
              {editing ? 'Save Changes' : 'Add Part'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select label="Part Type" value={form.partTypeId} onChange={(e) => setForm((f) => ({ ...f, partTypeId: e.target.value }))}
            options={(availablePartTypes as any[]).map((pt) => ({ value: pt.id, label: pt.name }))}
            placeholder="Select part type"
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Default Quantity</label>
            <input type="number" min={1} value={form.defaultQuantity}
              onChange={(e) => setForm((f) => ({ ...f, defaultQuantity: parseInt(e.target.value) || 1 }))}
              className="w-full h-8 px-3 rounded-md border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isOptional} onChange={(e) => setForm((f) => ({ ...f, isOptional: e.target.checked }))} className="rounded border-border" />
            <span className="text-sm text-foreground">Optional (operator confirms at unit creation)</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
