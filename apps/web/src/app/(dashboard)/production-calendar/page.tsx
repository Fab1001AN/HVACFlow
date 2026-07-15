'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfMonth } from 'date-fns';
import { GripVertical, Plus, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, Textarea, toast } from '@/components/shared';
import { cn } from '@/lib/utils';

const EMPTY_FORM = { serialNumber: '', displayName: '', unitTypeId: '', priorityLevelId: '', dueDate: '', oneDriveFolderUrl: '', notes: '' };
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
  const [overUnitId, setOverUnitId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['units', 'search', searchQuery],
    queryFn: () => api.units.search(searchQuery),
    enabled: searchQuery.trim().length >= 2,
  });

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
    mutationFn: async () => {
      // Shipping Date is a starting guess for which month to place the
      // unit in - not the same thing as production month (production
      // typically needs to start well before shipping), but it's a
      // reasonable default that beats always landing in "today" regardless
      // of when the unit actually ships. Still fully drag-adjustable.
      const guessedMonth = form.dueDate ? format(new Date(form.dueDate), 'yyyy-MM') : undefined;
      const unit = await api.units.createDirect({
        serialNumber: form.serialNumber,
        unitTypeId: form.unitTypeId,
        priorityLevelId: form.priorityLevelId || undefined,
        displayName: form.displayName || undefined,
        dueDate: form.dueDate || undefined,
        oneDriveFolderUrl: form.oneDriveFolderUrl || undefined,
        productionMonth: guessedMonth,
      });
      if (form.notes.trim()) {
        await api.units.addComment(unit.id, { message: form.notes.trim() });
      }
      return unit;
    },
    onSuccess: (unit: any) => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);

      if (unit.productionMonth) {
        const landedMonth = startOfMonth(new Date(unit.productionMonth));
        const visibleKeys = months.map((m) => format(m, 'yyyy-MM'));
        const landedKey = format(landedMonth, 'yyyy-MM');
        if (!visibleKeys.includes(landedKey)) setAnchor(landedMonth);
        toast(`Unit added to ${format(landedMonth, 'MMMM yyyy')} (based on shipping date) — drag to adjust`, 'success');
      } else {
        toast('Unit added — drag it to the right month whenever you\'re ready', 'success');
      }
    },
    onError: (e: any) => toast(e.message ?? 'Could not create unit', 'error'),
  });

  // Renumbers the full target month's list in one go (rather than just
  // appending the dragged unit to the end). This is what makes it possible
  // to drop a unit at any position - first, middle, or last - both when
  // moving between months and when reordering within the same month.
  const reorderMutation = useMutation({
    mutationFn: async ({ monthKey, orderedIds }: { monthKey: string; orderedIds: string[] }) => {
      await Promise.all(orderedIds.map((id, index) => api.units.move(id, { productionMonth: monthKey, priorityPosition: index })));
    },
    onMutate: async ({ monthKey, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (old = []) =>
        old.map((u) => {
          const index = orderedIds.indexOf(u.id);
          if (index === -1) return u;
          return { ...u, productionMonth: `${monthKey}-01T00:00:00.000Z`, priorityPosition: index };
        }),
      );
      return { previous };
    },
    onError: (e: any, _vars, context) => {
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
    setOverUnitId(null);
  }

  function getDraggedId(event: React.DragEvent): string | null {
    return event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData('text/plain') || draggedIdRef.current || null;
  }

  // Drops the dragged unit into monthKey, positioned immediately before
  // targetUnitId (or at the end of the month if targetUnitId is null -
  // e.g. dropped in the empty space below the last card).
  function handleDrop(event: React.DragEvent, monthKey: string, targetUnitId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const draggedUnitId = getDraggedId(event);
    if (!draggedUnitId || reorderMutation.isPending) return clearDrag();

    const currentList = (grouped.get(monthKey) ?? []).filter((u: any) => u.id !== draggedUnitId);
    const currentIds = currentList.map((u: any) => u.id);
    const insertAt = targetUnitId ? currentIds.indexOf(targetUnitId) : -1;
    const orderedIds = [...currentIds];
    if (insertAt === -1) {
      orderedIds.push(draggedUnitId);
    } else {
      orderedIds.splice(insertAt, 0, draggedUnitId);
    }

    // Skip the call entirely if nothing would actually change (dropped
    // back in its original spot).
    const draggedUnit = units.find((u: any) => u.id === draggedUnitId);
    const originalMonthKey = draggedUnit?.productionMonth ? format(new Date(draggedUnit.productionMonth), 'yyyy-MM') : from;
    const originalOrderedIds = (grouped.get(monthKey) ?? []).map((u: any) => u.id);
    const unchanged = originalMonthKey === monthKey && JSON.stringify(originalOrderedIds) === JSON.stringify(orderedIds);
    if (!unchanged) {
      reorderMutation.mutate({ monthKey, orderedIds });
    }
    clearDrag();
  }

  function jumpToUnit(unit: any) {
    const targetMonth = unit.productionMonth ? startOfMonth(new Date(unit.productionMonth)) : startOfMonth(new Date());
    setAnchor(targetMonth);
    setSearchOpen(false);
    setSearchQuery('');
  }


  return <div className="flex flex-col h-full">
    <PageHeader title="Production Calendar" description="Plan by month and year. Drag using the grip and drop anywhere inside another month." action={hasPermission('unit:manage') ? <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>Add Unit</Button> : undefined} />
    <div className="flex items-center gap-2 px-6 py-3 border-b">
      <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, -6))}><ChevronLeft className="w-4 h-4" /></Button>
      <Button variant="outline" size="sm" onClick={() => setAnchor(startOfMonth(new Date()))}>Current month</Button>
      <Button variant="outline" size="sm" onClick={() => setAnchor(addMonths(anchor, 6))}><ChevronRight className="w-4 h-4" /></Button>
      <div className="relative ml-2 flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search units by number or name…"
          className="w-full h-8 pl-8 pr-7 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {searchOpen && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-20 max-h-72 overflow-y-auto">
            {searching ? (
              <div className="p-3 flex justify-center"><Spinner className="w-4 h-4" /></div>
            ) : searchResults.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No units match "{searchQuery}"</div>
            ) : (
              searchResults.map((u: any) => (
                <button
                  key={u.id}
                  onClick={() => jumpToUnit(u)}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm flex items-center justify-between gap-2"
                >
                  <span className="font-medium">{u.serialNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.productionMonth ? format(new Date(u.productionMonth), 'MMM yyyy') : 'Unscheduled'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
    <div className="flex-1 overflow-auto p-4">{isLoading ? <div className="h-52 flex items-center justify-center"><Spinner /></div> : <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-6 gap-4 min-w-[1050px]">
      {months.map((month) => {
        const key = format(month, 'yyyy-MM');
        const list = grouped.get(key) ?? [];
        return (
          <section
            key={key}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverMonth(key); }}
            onDrop={(e) => handleDrop(e, key, null)}
            className={cn('rounded-xl border bg-secondary/30 min-h-[520px] transition-all duration-150', overMonth === key && 'ring-2 ring-primary bg-primary/5 scale-[1.01]')}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b bg-card rounded-t-xl">
              <div>
                <div className="text-sm font-semibold">{format(month, 'MMMM')}</div>
                <div className="text-xs text-muted-foreground">{format(month, 'yyyy')}</div>
              </div>
              <Badge variant="muted">{list.length}</Badge>
            </div>
            <div className="p-2 min-h-[460px] space-y-2">
              {list.map((unit: any) => (
                <div
                  key={unit.id}
                  draggable
                  aria-label={`Drag ${unit.serialNumber}`}
                  onDragStart={(e) => {
                    draggedIdRef.current = unit.id;
                    setDraggedId(unit.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(DRAG_TYPE, unit.id);
                    e.dataTransfer.setData('text/plain', unit.id);
                  }}
                  onDragEnd={clearDrag}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    setOverMonth(key);
                    setOverUnitId(unit.id);
                  }}
                  onDrop={(e) => handleDrop(e, key, unit.id)}
                  className="cursor-grab active:cursor-grabbing touch-none"
                >
                  <Card className={cn(
                    'p-3 transition-all',
                    draggedId === unit.id && 'opacity-35',
                    overUnitId === unit.id && draggedId !== unit.id && 'ring-2 ring-primary -translate-y-0.5',
                  )}>
                    <div className="flex gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary">{unit.serialNumber}</Link>
                        <div className="text-xs text-muted-foreground">{unit.unitType?.name}</div>
                        <div className="mt-2 text-[11px]">{unit.engineeringStatus?.replaceAll(/([A-Z])/g, ' $1').trim()} · {unit.productionReleaseStatus}</div>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverMonth(key); setOverUnitId(null); }}
                onDrop={(e) => handleDrop(e, key, null)}
                className={cn('h-24 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground transition-colors', overMonth === key && 'border-primary text-primary bg-primary/5')}
              >
                Drop unit here
              </div>
            </div>
          </section>
        );
      })}
    </div>}</div>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Unit" description="Create a unit, then drag it onto the month you want on the calendar." footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={createMutation.isPending} disabled={!form.serialNumber || !form.unitTypeId} onClick={() => createMutation.mutate()}>Create Unit</Button></div>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Unit Number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
        <Input label="Display Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <Select label="Unit Type" value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })} options={unitTypes.map((x: any) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} placeholder="Select" />
        <Select label="Priority" value={form.priorityLevelId} onChange={(e) => setForm({ ...form, priorityLevelId: e.target.value })} options={priorities.map((x: any) => ({ value: x.id, label: x.name }))} placeholder="Default" />
        <Input label="Shipping Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <Input label="OneDrive Folder URL" value={form.oneDriveFolderUrl} onChange={(e) => setForm({ ...form, oneDriveFolderUrl: e.target.value })} />
        <div className="md:col-span-2">
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything worth flagging - spec changes, customer requests, etc." />
        </div>
      </div>
    </Modal>
  </div>;
}
