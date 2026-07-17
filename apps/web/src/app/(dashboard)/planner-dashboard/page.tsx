'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfMonth } from 'date-fns';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@/components/shared';
import { Package, Rocket, X, Search, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';

const PART_DRAG_TYPE = 'application/x-hvacflow-parttype';
const MONTHS_VISIBLE = 4;
const PART_TYPE_ORDER_KEY = 'hvacflow:planner-part-type-order';

// Identical helper to Production Calendar's - productionMonth always
// comes back as UTC midnight on the 1st; parsing with a plain new Date()
// and formatting in local time can roll it back a day into the previous
// month for any timezone behind UTC. Reusing this exact fix rather than
// risking reintroducing that bug in a second place.
function parseMonthSafe(isoString: string): Date {
  const [year, month] = isoString.slice(0, 7).split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export default function PlannerDashboardPage() {
  const queryClient = useQueryClient();
  const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:planner-dashboard');
  const [search, setSearch] = useState('');
  const [anchor, setAnchor] = useState(startOfMonth(new Date()));
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

  // Reorderable palette - persisted per browser, purely a display
  // preference, doesn't touch the actual part type records.
  const [typeOrder, setTypeOrder] = useState<string[]>([]);
  const [draggedTypeForReorder, setDraggedTypeForReorder] = useState<string | null>(null);
  useEffect(() => {
    const available = (partTypes as any[]).map((p) => p.id);
    if (available.length === 0) return;
    const saved = localStorage.getItem(PART_TYPE_ORDER_KEY);
    let base: string[] = [];
    if (saved) {
      try { base = JSON.parse(saved) as string[]; } catch { /* ignore corrupt value */ }
    }
    const kept = base.filter((id) => available.includes(id));
    const added = available.filter((id) => !base.includes(id));
    setTypeOrder([...kept, ...added]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(partTypes as any[]).map((p) => p.id).join(',')]);

  const orderedPartTypes = typeOrder
    .map((id) => (partTypes as any[]).find((p) => p.id === id))
    .filter(Boolean);

  function reorderPartType(targetId: string) {
    if (!draggedTypeForReorder || draggedTypeForReorder === targetId) return;
    setTypeOrder((current) => {
      const next = [...current];
      const fromIdx = next.indexOf(draggedTypeForReorder);
      const toIdx = next.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return current;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      localStorage.setItem(PART_TYPE_ORDER_KEY, JSON.stringify(next));
      return next;
    });
    setDraggedTypeForReorder(null);
  }

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

  const deletePartMutation = useMutation({
    mutationFn: (partId: string) => api.parts.delete(partId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', 'planner-queue'] });
      toast('Part removed', 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not delete part', 'error'),
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

  const searchLower = search.trim().toLowerCase();
  const searching = searchLower.length > 0;
  const searchResults = searching
    ? units.filter((u: any) => u.serialNumber?.toLowerCase().includes(searchLower) || u.displayName?.toLowerCase().includes(searchLower))
    : [];

  const months = Array.from({ length: MONTHS_VISIBLE }, (_, i) => addMonths(anchor, i));
  const unitsByMonthKey = new Map<string, any[]>();
  for (const u of units as any[]) {
    const key = u.productionMonth ? format(parseMonthSafe(u.productionMonth), 'yyyy-MM') : 'unscheduled';
    if (!unitsByMonthKey.has(key)) unitsByMonthKey.set(key, []);
    unitsByMonthKey.get(key)!.push(u);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Planner"
        description="Engineering-released units land here. Drag part types onto a unit to build it out, then release it to the Production Manager."
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Part type palette - fixed width, own scroll, drag to reorder */}
        <div className="w-64 flex-shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Part Types</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Drag one onto a unit to add it. Drag by the grip to reorder this list.</p>
          <div className="space-y-1.5">
            {orderedPartTypes.map((pt: any) => (
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
                  'group flex items-center gap-1.5 px-2 py-2 rounded-md border border-border bg-secondary/40 text-sm cursor-grab active:cursor-grabbing transition-opacity',
                  draggedTypeId === pt.id && 'opacity-40',
                )}
              >
                <span
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDraggedTypeForReorder(pt.id); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); reorderPartType(pt.id); }}
                  className="cursor-grab active:cursor-grabbing text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{pt.code}</span>
                  <span className="text-muted-foreground"> — {pt.name}</span>
                </span>
              </div>
            ))}
            {partTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">No part types configured yet.</p>
            )}
          </div>
        </div>

        {/* Units */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-3 border-b border-border flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, -MONTHS_VISIBLE))} disabled={searching}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(startOfMonth(new Date()))} disabled={searching}>Current month</Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, MONTHS_VISIBLE))} disabled={searching}><ChevronRight className="w-4 h-4" /></Button>
            <div className="relative ml-2 flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search units by number or name…"
                className="w-full h-8 pl-8 pr-7 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center"><Spinner className="w-7 h-7" /></div>
          ) : units.length === 0 ? (
            <div className="flex-1 flex items-center justify-center"><EmptyState title="No active units" /></div>
          ) : searching ? (
            <div className="flex-1 overflow-y-auto p-6">
              {searchResults.length === 0 ? (
                <EmptyState title="No units match your search" />
              ) : (
                <div className="space-y-4 max-w-2xl">
                  {searchResults.map((unit: any) => (
                    <PlannerUnitCard
                      key={unit.id}
                      unit={unit}
                      dragOverUnitId={dragOverUnitId}
                      setDragOverUnitId={setDragOverUnitId}
                      handleDrop={handleDrop}
                      releaseMutation={releaseMutation}
                      deletePartMutation={deletePartMutation}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div style={zoomStyle} className="flex gap-4 p-4 h-full min-w-max">
                {months.map((month) => {
                  const key = format(month, 'yyyy-MM');
                  const monthUnits = unitsByMonthKey.get(key) ?? [];
                  return (
                    <div key={key} className="w-80 flex-shrink-0 flex flex-col">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-sm font-medium text-foreground">{format(month, 'MMMM yyyy')}</span>
                        <Badge variant="muted">{monthUnits.length}</Badge>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                        {monthUnits.length === 0 ? (
                          <div className="h-24 border border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                            No units this month
                          </div>
                        ) : (
                          monthUnits.map((unit: any) => (
                            <PlannerUnitCard
                              key={unit.id}
                              unit={unit}
                              dragOverUnitId={dragOverUnitId}
                              setDragOverUnitId={setDragOverUnitId}
                              handleDrop={handleDrop}
                              releaseMutation={releaseMutation}
                              deletePartMutation={deletePartMutation}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
                {(unitsByMonthKey.get('unscheduled')?.length ?? 0) > 0 && (
                  <div className="w-80 flex-shrink-0 flex flex-col">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="text-sm font-medium text-foreground">Unscheduled</span>
                      <Badge variant="muted">{unitsByMonthKey.get('unscheduled')!.length}</Badge>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                      {unitsByMonthKey.get('unscheduled')!.map((unit: any) => (
                        <PlannerUnitCard
                          key={unit.id}
                          unit={unit}
                          dragOverUnitId={dragOverUnitId}
                          setDragOverUnitId={setDragOverUnitId}
                          handleDrop={handleDrop}
                          releaseMutation={releaseMutation}
                          deletePartMutation={deletePartMutation}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
    </div>
  );
}

function PlannerUnitCard({
  unit,
  dragOverUnitId,
  setDragOverUnitId,
  handleDrop,
  releaseMutation,
  deletePartMutation,
}: {
  unit: any;
  dragOverUnitId: string | null;
  setDragOverUnitId: (id: string | null) => void;
  handleDrop: (e: React.DragEvent, unitId: string) => void;
  releaseMutation: any;
  deletePartMutation: any;
}) {
  const releaseEligible = unit.engineeringStatus === 'ReleasedToManufacturing' && unit.productionReleaseStatus === 'AwaitingRelease';
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOverUnitId(unit.id); }}
      onDragLeave={() => setDragOverUnitId(null)}
      onDrop={(e) => handleDrop(e, unit.id)}
    >
      <Card className={cn('p-3 transition-all', dragOverUnitId === unit.id && 'ring-2 ring-primary bg-primary/5')}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary">{unit.serialNumber}</Link>
            <div className="text-xs text-muted-foreground truncate">{unit.unitType?.name}{unit.dueDate ? ` · Ships ${new Date(unit.dueDate).toLocaleDateString()}` : ''}</div>
          </div>
          {!releaseEligible && (
            <span title="Engineering hasn't released this unit yet - you can still add parts ahead of time.">
              <Badge variant="muted">
                {unit.engineeringStatus === 'ReleasedToManufacturing' ? 'Planned' : 'In Eng.'}
              </Badge>
            </span>
          )}
        </div>

        <div className="rounded-lg border-2 border-dashed border-border p-2.5 min-h-[70px]">
          {(unit.parts?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Drop a part here.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unit.parts.map((part: any) => (
                <span key={part.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-[11px]">
                  <Package className="w-2.5 h-2.5 text-muted-foreground" />
                  {part.partType?.name ?? part.identifier}
                  <button
                    type="button"
                    title="Remove this part"
                    disabled={deletePartMutation.isPending && deletePartMutation.variables === part.id}
                    onClick={() => {
                      if (confirm(`Remove ${part.partType?.name ?? part.identifier} from this unit? Only do this if it was added by mistake.`)) {
                        deletePartMutation.mutate(part.id);
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {releaseEligible ? (
          <Button
            size="sm"
            className="w-full mt-2"
            leftIcon={<Rocket className="w-3.5 h-3.5" />}
            disabled={(unit.parts?.length ?? 0) === 0}
            loading={releaseMutation.isPending && releaseMutation.variables === unit.id}
            onClick={() => releaseMutation.mutate(unit.id)}
          >
            Release
          </Button>
        ) : (unit.parts?.length ?? 0) === 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5">Add a part before releasing.</p>
        )}
      </Card>
    </div>
  );
}
