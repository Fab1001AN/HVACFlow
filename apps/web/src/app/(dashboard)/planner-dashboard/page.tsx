'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@/components/shared';
import { Package, Rocket, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PART_DRAG_TYPE = 'application/x-hvacflow-parttype';

export default function PlannerDashboardPage() {
  const queryClient = useQueryClient();
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['units', 'planner-queue'],
    queryFn: api.units.plannerQueue,
    refetchInterval: 20_000,
  });
  const { data: partTypes = [] } = useQuery({
    queryKey: ['part-types'],
    queryFn: () => api.partTypes.list({ isActive: true }),
    staleTime: Infinity,
  });

  const [draggedTypeId, setDraggedTypeId] = useState<string | null>(null);
  const draggedTypeRef = useRef<string | null>(null);
  const [dragOverUnitId, setDragOverUnitId] = useState<string | null>(null);

  const addPartMutation = useMutation({
    mutationFn: ({ unitId, partTypeId, code }: { unitId: string; partTypeId: string; code: string }) =>
      api.parts.create(unitId, { partTypeId, identifier: code, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', 'planner-queue'] });
      toast('Part added', 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not add part', 'error'),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => api.units.markPlanned(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', 'planner-queue'] });
      toast('Unit released to the Production Manager', 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not release unit', 'error'),
  });

  function handleDrop(event: React.DragEvent, unitId: string) {
    event.preventDefault();
    const partTypeId = event.dataTransfer.getData(PART_DRAG_TYPE) || draggedTypeRef.current;
    setDragOverUnitId(null);
    setDraggedTypeId(null);
    draggedTypeRef.current = null;
    if (!partTypeId) return;
    const partType = (partTypes as any[]).find((p) => p.id === partTypeId);
    if (!partType) return;
    addPartMutation.mutate({ unitId, partTypeId, code: partType.code ?? partType.name });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Planner"
        description="Engineering-released units land here. Drag part types onto a unit to build it out, then release it to the Production Manager."
      />
      <div className="flex-1 overflow-y-auto p-6 grid xl:grid-cols-[280px_1fr] gap-6">
        {/* Part type palette */}
        <Card className="p-4 h-fit xl:sticky xl:top-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Part Types</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Drag one onto a unit on the right to add it.</p>
          <div className="space-y-1.5">
            {(partTypes as any[]).map((pt: any) => (
              <div
                key={pt.id}
                draggable
                onDragStart={(e) => {
                  draggedTypeRef.current = pt.id;
                  setDraggedTypeId(pt.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData(PART_DRAG_TYPE, pt.id);
                }}
                onDragEnd={() => { setDraggedTypeId(null); draggedTypeRef.current = null; }}
                className={cn(
                  'px-3 py-2 rounded-md border border-border bg-secondary/40 text-sm cursor-grab active:cursor-grabbing transition-opacity',
                  draggedTypeId === pt.id && 'opacity-40',
                )}
              >
                <span className="font-medium">{pt.code}</span>
                <span className="text-muted-foreground"> — {pt.name}</span>
              </div>
            ))}
            {partTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">No part types configured yet.</p>
            )}
          </div>
        </Card>

        {/* Units awaiting planning */}
        {isLoading ? (
          <div className="flex items-center justify-center h-52"><Spinner className="w-7 h-7" /></div>
        ) : units.length === 0 ? (
          <EmptyState title="Nothing to plan right now" description="Units show up here once Engineering releases them." />
        ) : (
          <div className="space-y-4">
            {units.map((unit: any) => (
              <div
                key={unit.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverUnitId(unit.id); }}
                onDragLeave={() => setDragOverUnitId((current) => (current === unit.id ? null : current))}
                onDrop={(e) => handleDrop(e, unit.id)}
              >
                <Card className={cn(
                  'p-4 transition-all',
                  dragOverUnitId === unit.id && 'ring-2 ring-primary bg-primary/5',
                )}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <Link href={`/units/${unit.id}`} className="font-semibold hover:text-primary">{unit.serialNumber}</Link>
                      <div className="text-xs text-muted-foreground">{unit.unitType?.name}{unit.dueDate ? ` · Ships ${new Date(unit.dueDate).toLocaleDateString()}` : ''}</div>
                    </div>
                    <Button
                      size="sm"
                      leftIcon={<Rocket className="w-3.5 h-3.5" />}
                      disabled={(unit.parts?.length ?? 0) === 0}
                      loading={releaseMutation.isPending && releaseMutation.variables === unit.id}
                      onClick={() => releaseMutation.mutate(unit.id)}
                    >
                      Release to Production Manager
                    </Button>
                  </div>

                  <div className="rounded-lg border-2 border-dashed border-border p-3 min-h-[88px]">
                    {(unit.parts?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Drop a part type here to add it to this unit.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {unit.parts.map((part: any) => (
                          <span key={part.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-xs">
                            <Package className="w-3 h-3 text-muted-foreground" />
                            {part.partType?.name ?? part.identifier}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(unit.parts?.length ?? 0) === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">Add at least one part before releasing.</p>
                  )}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
