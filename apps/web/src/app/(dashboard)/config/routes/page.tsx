'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Select, Spinner, Card, EmptyState } from '@/components/shared';
import { Plus, GripVertical, Trash2, ArrowRight, GitBranch, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';
import { RouteTargetType } from '@hvacflow/shared-types';

export default function ProcessRoutesPage() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<RouteTargetType>(RouteTargetType.PART_TYPE);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [addingStep, setAddingStep] = useState(false);
  const [newProcessId, setNewProcessId] = useState('');
  const [isOptional, setIsOptional] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: unitTypes = [] } = useQuery({ queryKey: ['unit-types'], queryFn: () => api.unitTypes.list({ isActive: true }), staleTime: Infinity });
  const { data: partTypes = [] } = useQuery({ queryKey: ['part-types'], queryFn: () => api.partTypes.list({ isActive: true }), staleTime: Infinity });
  const { data: processes = [] } = useQuery({ queryKey: ['process-definitions'], queryFn: () => api.processDefinitions.list({ isActive: true }), staleTime: Infinity });

  const types = targetType === RouteTargetType.PART_TYPE ? partTypes : unitTypes;
  const filteredProcesses = (processes as any[]).filter((p) =>
    targetType === RouteTargetType.UNIT_TYPE ? p.appliesTo === 'UNIT' : p.appliesTo === 'PART'
  );

  const routeParams = selectedTypeId ? (
    targetType === RouteTargetType.PART_TYPE ? { partTypeId: selectedTypeId } : { unitTypeId: selectedTypeId }
  ) : null;

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['process-routes', targetType, selectedTypeId],
    queryFn: () => api.processRoutes.list(routeParams!),
    enabled: !!selectedTypeId,
  });

  const addMutation = useMutation({
    mutationFn: () => api.processRoutes.create({
      targetType,
      ...(targetType === RouteTargetType.PART_TYPE ? { partTypeId: selectedTypeId } : { unitTypeId: selectedTypeId }),
      processDefinitionId: newProcessId,
      sequenceOrder: (routes as any[]).length + 1,
      isOptional,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['process-routes'] });
      setAddingStep(false);
      setNewProcessId('');
      setIsOptional(false);
      toast('Step added', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.processRoutes.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['process-routes'] }); toast('Step removed', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sequenceOrder: number }>) => api.processRoutes.reorder(items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['process-routes'] }),
  });

  const moveStep = (fromIndex: number, toIndex: number) => {
    const reordered = [...(routes as any[])];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    reorderMutation.mutate(reordered.map((r, i) => ({ id: r.id, sequenceOrder: i + 1 })));
  };

  const selectedTypeName = (types as any[]).find((t) => t.id === selectedTypeId)?.name ?? '';

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Process Routes"
        description="Define the ordered sequence of operations for each Part Type or Unit Type."
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Selector */}
        <Card className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
              {[RouteTargetType.PART_TYPE, RouteTargetType.UNIT_TYPE].map((t) => (
                <button key={t} onClick={() => { setTargetType(t); setSelectedTypeId(''); }}
                  className={cn('px-3 py-1 rounded text-xs font-medium transition-colors',
                    targetType === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}>
                  {t === RouteTargetType.PART_TYPE ? 'Part Types' : 'Unit Types'}
                </button>
              ))}
            </div>
            <div className="flex-1 max-w-xs">
              <Select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}
                options={(types as any[]).map((t) => ({ value: t.id, label: t.name }))}
                placeholder={`Select ${targetType === RouteTargetType.PART_TYPE ? 'part type' : 'unit type'}…`}
              />
            </div>
          </div>
        </Card>

        {/* Route builder */}
        {!selectedTypeId ? (
          <EmptyState title="Select a type" description="Choose a Part Type or Unit Type above to view and edit its process route." icon={<GitBranch className="w-10 h-10" />} />
        ) : routesLoading ? (
          <div className="flex items-center justify-center h-32"><Spinner className="w-6 h-6" /></div>
        ) : (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Route for: <span className="text-primary">{selectedTypeName}</span>
                <span className="ml-2 text-xs text-muted-foreground">({(routes as any[]).length} steps)</span>
              </h3>
              <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddingStep(true)}>
                Add Step
              </Button>
            </div>

            {/* Warning about existing tasks */}
            <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Changes apply to new parts/units only — existing tasks are not modified retroactively.
            </div>

            {(routes as any[]).length === 0 ? (
              <Card className="flex items-center justify-center h-24 border-dashed">
                <span className="text-sm text-muted-foreground">No steps yet — add the first operation</span>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="divide-y divide-border">
                  {(routes as any[]).map((step, index) => (
                    <div
                      key={step.id}
                      draggable
                      onDragStart={() => setDragging(step.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragging && dragging !== step.id) {
                          const fromIdx = (routes as any[]).findIndex((r) => r.id === dragging);
                          moveStep(fromIdx, index);
                        }
                        setDragging(null);
                      }}
                      className={cn('flex items-center gap-3 px-4 py-3 group transition-colors', dragging === step.id ? 'opacity-40' : 'hover:bg-accent/50')}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab flex-shrink-0" />
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        {index + 1}
                      </div>
                      {index < (routes as any[]).length - 1 && (
                        <ArrowRight className="absolute ml-8 mt-8 w-3 h-3 text-muted-foreground opacity-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{step.processDefinition?.name}</span>
                          <span className="text-xs text-muted-foreground">{step.processDefinition?.department?.name}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {step.processDefinition?.requiresVerification && (
                            <span className="text-xs text-orange-400">Requires verification</span>
                          )}
                          {step.processDefinition?.requiresChecklist && (
                            <span className="text-xs text-blue-400">Checklist required</span>
                          )}
                        </div>
                      </div>
                      <span className={cn('text-xs px-2 py-0.5 rounded', step.isOptional ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                        {step.isOptional ? 'Optional' : 'Required'}
                      </span>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Remove this step?')) deleteMutation.mutate(step.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Add step form */}
            {addingStep && (
              <Card className="p-4 space-y-3">
                <h4 className="text-sm font-medium text-foreground">Add Step</h4>
                <Select value={newProcessId} onChange={(e) => setNewProcessId(e.target.value)}
                  options={filteredProcesses.map((p: any) => ({ value: p.id, label: `${p.name} (${p.department?.name})` }))}
                  placeholder="Select process…"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isOptional} onChange={(e) => setIsOptional(e.target.checked)} className="rounded border-border" />
                  <span className="text-sm text-foreground">Optional step</span>
                </label>
                <div className="flex gap-2">
                  <Button size="sm" loading={addMutation.isPending} disabled={!newProcessId} onClick={() => addMutation.mutate()}>Add Step</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingStep(false); setNewProcessId(''); }}>Cancel</Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
