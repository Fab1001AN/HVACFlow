'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfMonth } from 'date-fns';
import { GripVertical, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, toast } from '@/components/shared';
import { cn } from '@/lib/utils';

const currentMonth = format(new Date(), 'yyyy-MM');
const EMPTY_FORM = { serialNumber: '', displayName: '', unitTypeId: '', priorityLevelId: '', productionMonth: currentMonth, dueDate: '', oneDriveFolderUrl: '' };
const DRAG_TYPE = 'application/x-hvacflow-unit';

export default function ProductionCalendarPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [anchor, setAnchor] = useState(startOfMonth(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [overMonth, setOverMonth] = useState<string | null>(null);

  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonths(anchor, i)), [anchor]);
  const from = format(months[0], 'yyyy-MM');
  const to = format(addMonths(months[months.length - 1], 1), 'yyyy-MM');
  const queryKey = ['units', 'calendar', from, to] as const;
  const { data: units = [], isLoading } = useQuery({ queryKey, queryFn: () => api.units.calendar({ from, to }) });
  const { data: unitTypes = [] } = useQuery({ queryKey: ['unit-types'], queryFn: () => api.unitTypes.list({ isActive: true }) });
  const { data: priorities = [] } = useQuery({ queryKey: ['priorities'], queryFn: () => api.priorityLevels.list({ isActive: true }) });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    months.forEach((m) => map.set(format(m, 'yyyy-MM'), []));
    units.forEach((u: any) => {
      const key = u.productionMonth ? format(new Date(u.productionMonth), 'yyyy-MM') : from;
      if (map.has(key)) map.get(key)!.push(u);
    });
    map.forEach((items) => items.sort((a, b) => a.priorityPosition - b.priorityPosition || a.serialNumber.localeCompare(b.serialNumber)));
    return map;
  }, [months, units, from]);

  const createMutation = useMutation({
    mutationFn: () => api.units.createDirect({ ...form, priorityLevelId: form.priorityLevelId || undefined, displayName: form.displayName || undefined, dueDate: form.dueDate || undefined, oneDriveFolderUrl: form.oneDriveFolderUrl || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['units'] }); setCreateOpen(false); setForm(EMPTY_FORM); toast('Unit added', 'success'); },
    onError: (e: any) => toast(e.message ?? 'Could not create unit', 'error'),
  });

  const moveMutation = useMutation({
    mutationFn: (payload: { id: string; productionMonth: string; priorityPosition: number }) => api.units.move(payload.id, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (old = []) => old.map((u) => u.id === payload.id ? { ...u, productionMonth: `${payload.productionMonth}-01T00:00:00.000Z`, priorityPosition: payload.priorityPosition } : u));
      return { previous };
    },
    onError: (e: any, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast(e.message ?? 'Move failed; card restored', 'error');
    },
    onSuccess: () => toast('Unit moved', 'success'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['units', 'calendar'] }),
  });

  function clearDrag() {
    draggedIdRef.current = null;
    setDraggedId(null);
    setOverMonth(null);
  }

  function drop(event: React.DragEvent, monthKey: string) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData('text/plain') || draggedIdRef.current;
    const unit = units.find((item: any) => item.id === id);
    if (!unit || moveMutation.isPending) return clearDrag();
    const target = grouped.get(monthKey) ?? [];
    const currentMonthKey = unit.productionMonth ? format(new Date(unit.productionMonth), 'yyyy-MM') : from;
    const nextPosition = currentMonthKey === monthKey ? Math.max(0, target.length - 1) : target.length;
    if (currentMonthKey !== monthKey || unit.priorityPosition !== nextPosition) {
      moveMutation.mutate({ id: unit.id, productionMonth: monthKey, priorityPosition: nextPosition });
    }
    clearDrag();
  }

  const monthOptions = Array.from({ length: 36 }, (_, i) => addMonths(startOfMonth(new Date()), i - 6)).map((m) => ({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy') }));

  return <div className="flex flex-col h-full">
    <PageHeader title="Production Calendar" description="Plan by month and year. Drag using the grip and drop anywhere inside another month." action={hasPermission('unit:manage') ? <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Add Unit</Button> : undefined} />
    <div className="flex items-center gap-2 px-6 py-3 border-b"><Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, -6))}><ChevronLeft className="w-4 h-4" /></Button><Button variant="outline" size="sm" onClick={() => setAnchor(startOfMonth(new Date()))}>Current month</Button><Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, 6))}><ChevronRight className="w-4 h-4" /></Button></div>
    <div className="flex-1 overflow-auto p-4">{isLoading ? <div className="h-52 flex items-center justify-center"><Spinner /></div> : <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-6 gap-4 min-w-[1050px]">
      {months.map((month) => { const key = format(month, 'yyyy-MM'); const list = grouped.get(key) ?? []; return <section key={key} onDragEnter={(e) => { e.preventDefault(); setOverMonth(key); }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverMonth(key); }} onDrop={(e) => drop(e, key)} className={cn('rounded-xl border bg-secondary/30 min-h-[520px] transition-all duration-150', overMonth === key && 'ring-2 ring-primary bg-primary/5 scale-[1.01]')}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b bg-card rounded-t-xl"><div><div className="text-sm font-semibold">{format(month, 'MMMM')}</div><div className="text-xs text-muted-foreground">{format(month, 'yyyy')}</div></div><Badge variant="muted">{list.length}</Badge></div>
        <div className="p-2 min-h-[460px] space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, key)}>{list.map((unit: any) => <Card key={unit.id} className={cn('p-3 transition-opacity', draggedId === unit.id && 'opacity-35')}><div className="flex gap-2"><button type="button" draggable aria-label={`Drag ${unit.serialNumber}`} onDragStart={(e) => { draggedIdRef.current = unit.id; setDraggedId(unit.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData(DRAG_TYPE, unit.id); e.dataTransfer.setData('text/plain', unit.id); }} onDragEnd={clearDrag} className="cursor-grab active:cursor-grabbing p-1 -m-1 touch-none"><GripVertical className="w-4 h-4 text-muted-foreground" /></button><div className="min-w-0 flex-1"><Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary">{unit.serialNumber}</Link><div className="text-xs text-muted-foreground">{unit.unitType?.name}</div><div className="mt-2 text-[11px]">{unit.engineeringStatus?.replaceAll(/([A-Z])/g, ' $1').trim()} · {unit.productionReleaseStatus}</div></div></div></Card>)}<div className={cn('h-24 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground transition-colors', overMonth === key && 'border-primary text-primary bg-primary/5')}>Drop unit here</div></div>
      </section>; })}
    </div>}</div>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Unit" description="Create a unit directly and assign its production month." footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={createMutation.isPending} disabled={!form.serialNumber || !form.unitTypeId || !form.productionMonth} onClick={() => createMutation.mutate()}>Create Unit</Button></div>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Unit Number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /><Input label="Display Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /><Select label="Unit Type" value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })} options={unitTypes.map((x: any) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} placeholder="Select" /><Select label="Priority" value={form.priorityLevelId} onChange={(e) => setForm({ ...form, priorityLevelId: e.target.value })} options={priorities.map((x: any) => ({ value: x.id, label: x.name }))} placeholder="Default" /><Select label="Production Month" value={form.productionMonth} onChange={(e) => setForm({ ...form, productionMonth: e.target.value })} options={monthOptions} /><Input label="Shipping Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /><div className="md:col-span-2"><Input label="OneDrive Folder URL" value={form.oneDriveFolderUrl} onChange={(e) => setForm({ ...form, oneDriveFolderUrl: e.target.value })} /></div></div>
    </Modal>
  </div>;
}
