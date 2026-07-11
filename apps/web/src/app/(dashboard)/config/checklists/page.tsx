'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, Select, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, Pencil, Trash2, GripVertical, ListChecks, ChevronRight } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function ChecklistsPage() {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({ processDefinitionId: '', name: '' });
  const [itemForm, setItemForm] = useState({ label: '', isRequired: true });

  const { data: templates = [], isLoading } = useQuery({ queryKey: ['checklists'], queryFn: () => api.checklists.list() });
  const { data: processes = [] } = useQuery({ queryKey: ['process-definitions'], queryFn: () => api.processDefinitions.list({ isActive: true }), staleTime: Infinity });

  const selectedTemplate = (templates as any[]).find((t) => t.id === selectedTemplateId);

  const templateMutation = useMutation({
    mutationFn: (body: any) => editingTemplate ? api.checklists.update(editingTemplate.id, body) : api.checklists.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ processDefinitionId: '', name: '' });
      toast(editingTemplate ? 'Checklist updated' : 'Checklist created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const itemMutation = useMutation({
    mutationFn: (body: any) => editingItem
      ? api.checklists.updateItem(editingItem.id, body)
      : api.checklists.addItem(selectedTemplateId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setItemModalOpen(false);
      setEditingItem(null);
      setItemForm({ label: '', isRequired: true });
      toast(editingItem ? 'Item updated' : 'Item added', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.checklists.deleteItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklists'] }); toast('Item removed', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openAddItem = () => { setEditingItem(null); setItemForm({ label: '', isRequired: true }); setItemModalOpen(true); };
  const openEditItem = (item: any) => { setEditingItem(item); setItemForm({ label: item.label, isRequired: item.isRequired }); setItemModalOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Checklists"
        description="Checklist templates are attached to process definitions. Items are instantiated when a task starts."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => { setEditingTemplate(null); setTemplateForm({ processDefinitionId: '', name: '' }); setTemplateModalOpen(true); }}>New Checklist</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {/* Templates list */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-foreground">Templates</h3>
              </div>
              <div className="divide-y divide-border overflow-y-auto">
                {(templates as any[]).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No checklists yet</div>
                ) : (templates as any[]).map((tmpl) => (
                  <button key={tmpl.id} onClick={() => setSelectedTemplateId(tmpl.id)}
                    className={cn('w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors', selectedTemplateId === tmpl.id && 'bg-primary/5 border-l-2 border-primary')}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tmpl.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tmpl.processDefinition?.name}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{tmpl._count?.items ?? tmpl.items?.length ?? 0} items</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </Card>

            {/* Template items */}
            <div className="md:col-span-2">
              {!selectedTemplate ? (
                <EmptyState title="Select a checklist" description="Choose a checklist template to view and edit its items." icon={<ListChecks className="w-10 h-10" />} />
              ) : (
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{selectedTemplate.name}</h3>
                      <p className="text-xs text-muted-foreground">{selectedTemplate.processDefinition?.name}</p>
                    </div>
                    <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openAddItem}>Add Item</Button>
                  </div>
                  <div className="divide-y divide-border">
                    {(!selectedTemplate.items || selectedTemplate.items.length === 0) ? (
                      <div className="p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No items yet</p>
                        <Button size="sm" onClick={openAddItem}>Add First Item</Button>
                      </div>
                    ) : (selectedTemplate.items as any[]).map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-accent/50">
                        <span className="text-xs text-muted-foreground w-5 tabular-nums">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{item.label}</p>
                        </div>
                        <span className={cn('text-xs px-2 py-0.5 rounded', item.isRequired ? 'bg-orange-500/10 text-orange-400' : 'bg-muted text-muted-foreground')}>
                          {item.isRequired ? 'Required' : 'Optional'}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" onClick={() => openEditItem(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                            onClick={() => { if (confirm('Remove item?')) deleteItemMutation.mutate(item.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template modal */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title="New Checklist Template"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
            <Button loading={templateMutation.isPending} disabled={!templateForm.name || !templateForm.processDefinitionId}
              onClick={() => templateMutation.mutate(templateForm)}>Create</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select label="Process Definition" value={templateForm.processDefinitionId}
            onChange={(e) => setTemplateForm((f) => ({ ...f, processDefinitionId: e.target.value }))}
            options={(processes as any[]).filter((p) => p.requiresChecklist).map((p: any) => ({ value: p.id, label: `${p.name} (${p.department?.name})` }))}
            placeholder="Select process (checklist required)"
          />
          <Input label="Checklist Name" value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Final Assembly QC" />
        </div>
      </Modal>

      {/* Item modal */}
      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title={editingItem ? 'Edit Item' : 'Add Checklist Item'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setItemModalOpen(false)}>Cancel</Button>
            <Button loading={itemMutation.isPending} disabled={!itemForm.label} onClick={() => itemMutation.mutate(itemForm)}>
              {editingItem ? 'Save' : 'Add Item'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Item Label" value={itemForm.label} onChange={(e) => setItemForm((f) => ({ ...f, label: e.target.value }))} placeholder="Torque all fasteners to spec" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={itemForm.isRequired} onChange={(e) => setItemForm((f) => ({ ...f, isRequired: e.target.checked }))} className="rounded border-border" />
            <span className="text-sm text-foreground">Required (must be checked to complete task)</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
