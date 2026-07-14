'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfMonth } from 'date-fns';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, ProgressBar, Select, Spinner, toast } from '@/components/shared';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, GripVertical, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_FORM = {
  serialNumber: '',
  displayName: '',
  unitTypeId: '',
  priorityLevelId: '',
  plannedStartDate: format(new Date(), 'yyyy-MM-dd'),
  dueDate: '',
  oneDriveFolderUrl: '',
};

export default function ProductionCalendarPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [anchor, setAnchor] = useState(startOfMonth(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonths(anchor, i)), [anchor]);
  const from = format(months[0], 'yyyy-MM-dd');
  const to = format(addMonths(months[months.length - 1], 1), 'yyyy-MM-dd');

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['units', 'calendar', from, to],
    queryFn: () => api.units.calendar({ from, to }),
  });
  const { data: unitTypes = [] } = useQuery({
    queryKey: ['unit-types'], queryFn: () => api.unitTypes.list({ isActive: true }), staleTime: 60_000,
  });
  const { data: priorities = [] } = useQuery({
    queryKey: ['priorities'], queryFn: () => api.priorityLevels.list({ isActive: true }), staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.units.createDirect({
      ...body,
      priorityLevelId: body.priorityLevelId || undefined,
      displayName: body.displayName || undefined,
      dueDate: body.dueDate || undefined,
      oneDriveFolderUrl: body.oneDriveFolderUrl || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      toast('Unit added to production calendar', 'success');
    },
    onError: (error: any) => toast(error.message ?? 'Could not create unit', 'error'),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, plannedStartDate, priorityPosition }: { id: string; plannedStartDate: string; priorityPosition: number }) =>
      api.units.move(id, { plannedStartDate, priorityPosition }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units', 'calendar'] }),
    onError: (error: any) => toast(error.message ?? 'Could not move unit', 'error'),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const month of months) map.set(format(month, 'yyyy-MM'), []);
    map.set('unscheduled', []);
    for (const unit of units) {
      const key = unit.plannedStartDate ? format(new Date(unit.plannedStartDate), 'yyyy-MM') : 'unscheduled';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(unit);
    }
    for (const list of map.values()) list.sort((a, b) => a.priorityPosition - b.priorityPosition);
    return map;
  }, [months, units]);

  function dropInto(month: Date, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!draggedId) return;
    const target = grouped.get(format(month, 'yyyy-MM')) ?? [];
    moveMutation.mutate({ id: draggedId, plannedStartDate: format(month, 'yyyy-MM-01'), priorityPosition: target.length });
    setDraggedId(null);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Production Calendar"
        description="Plan units directly, move them between months, and control manufacturing priority."
        action={hasPermission('unit:manage') ? (
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Add Unit</Button>
        ) : undefined}
      />

      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/40">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, -6))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfMonth(new Date()))}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, 6))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="text-xs text-muted-foreground">Drag cards to another month to reschedule them</div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="h-52 flex items-center justify-center"><Spinner className="w-6 h-6" /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-6 gap-4 min-w-[1050px]">
            {months.map((month) => {
              const key = format(month, 'yyyy-MM');
              const monthUnits = grouped.get(key) ?? [];
              return (
                <div
                  key={key}
                  className="rounded-xl border border-border bg-secondary/30 min-h-[520px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropInto(month, e)}
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b border-border bg-card rounded-t-xl">
                    <div>
                      <div className="text-sm font-semibold">{format(month, 'MMMM')}</div>
                      <div className="text-xs text-muted-foreground">{format(month, 'yyyy')}</div>
                    </div>
                    <Badge variant="muted">{monthUnits.length}</Badge>
                  </div>
                  <div className="p-2 space-y-2">
                    {monthUnits.map((unit) => (
                      <UnitCard key={unit.id} unit={unit} onDragStart={() => setDraggedId(unit.id)} />
                    ))}
                    {!monthUnits.length && (
                      <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
                        Drop units here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Unit to Production Calendar"
        description="Customer, project, and order are optional. Start planning the unit directly."
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={createMutation.isPending} disabled={!form.serialNumber || !form.unitTypeId || !form.plannedStartDate} onClick={() => createMutation.mutate(form)}>Create Unit</Button></div>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Unit Number" placeholder="RTU-2407-01" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          <Input label="Display Name" placeholder="North Wing RTU" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <Select label="Unit Type" value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })} options={unitTypes.map((x: any) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} placeholder="Select unit type" />
          <Select label="Priority" value={form.priorityLevelId} onChange={(e) => setForm({ ...form, priorityLevelId: e.target.value })} options={priorities.map((x: any) => ({ value: x.id, label: x.name }))} placeholder="Use default priority" />
          <Input label="Planned Start" type="date" value={form.plannedStartDate} onChange={(e) => setForm({ ...form, plannedStartDate: e.target.value })} />
          <Input label="Due / Shipping Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <div className="md:col-span-2"><Input label="OneDrive Folder URL" placeholder="https://..." value={form.oneDriveFolderUrl} onChange={(e) => setForm({ ...form, oneDriveFolderUrl: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}

function UnitCard({ unit, onDragStart }: { unit: any; onDragStart: () => void }) {
  const progress = Number(unit.progressPercentage ?? 0);
  const due = unit.dueDate ? new Date(unit.dueDate) : null;
  const overdue = due && due < new Date() && !['Completed', 'Dispatched'].includes(unit.status);
  return (
    <Card className={cn('p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors', unit.isBlocked && 'border-red-500/50 bg-red-500/5')}>
      <div draggable onDragStart={onDragStart}>
        <div className="flex items-start gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary truncate">{unit.serialNumber}</Link>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: unit.priorityLevel?.color ?? '#64748b' }} />
            </div>
            <p className="text-xs text-muted-foreground truncate">{unit.displayName || unit.unitType?.name}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{unit.currentStage || unit.currentDepartment?.name || 'Engineering'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} size="sm" />
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className={cn('text-muted-foreground', overdue && 'text-red-400 font-medium')}>{due ? format(due, 'MMM d') : 'No due date'}</span>
            <span className="text-muted-foreground">{unit._count?.parts ?? 0} parts</span>
          </div>
          {unit.isBlocked && (
            <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{unit.holdReason || 'Blocked'}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <Badge variant="outline">{unit.unitType?.code}</Badge>
            {unit.oneDriveFolderUrl && <a href={unit.oneDriveFolderUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="w-3.5 h-3.5" /></a>}
          </div>
        </div>
      </div>
    </Card>
  );
}
