'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Spinner, toast } from '@/components/shared';
import { Package, CheckCircle2, Clock3, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PART_DRAG_TYPE = 'application/x-hvacflow-parttype';

export default function PurchasingDashboardPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [draggedTypeId, setDraggedTypeId] = useState<string | null>(null);
  const draggedTypeRef = useRef<string | null>(null);
  const [dragOverUnitId, setDragOverUnitId] = useState<string | null>(null);

  // The receive-status modal - opened either by dropping a part type
  // onto a unit (create) or clicking an existing vendor part badge
  // (edit, since arrival dates slip and need to stay editable).
  const [modalState, setModalState] = useState<
    | { mode: 'create'; unitId: string; unitSerial: string; partTypeId: string; partTypeName: string }
    | { mode: 'edit'; vendorPart: any }
    | null
  >(null);

  const { data: vendorPartTypes = [] } = useQuery({
    queryKey: ['part-types', 'vendor'],
    queryFn: () => api.partTypes.list({ isActive: true, sourceType: 'Vendor' }),
    staleTime: 60_000,
  });

  const { data: unitsPage, isLoading } = useQuery({
    queryKey: ['units', 'list', 'purchasing'],
    queryFn: () => api.units.list({ pageSize: 100 }),
  });
  const { data: searchResults = [] } = useQuery({
    queryKey: ['units', 'search', search],
    queryFn: () => api.units.search(search),
    enabled: search.trim().length >= 2,
  });
  const units: any[] = search.trim().length >= 2 ? searchResults : (unitsPage?.data ?? []);

  // Fetch each visible unit's vendor parts in parallel.
  const vendorPartQueries = useQueries({
    queries: units.map((u: any) => ({
      queryKey: ['vendor-parts', u.id],
      queryFn: () => api.vendorParts.listByUnit(u.id),
      enabled: !!u.id,
    })),
  });

  function vendorPartsFor(unitId: string): any[] {
    const index = units.findIndex((u) => u.id === unitId);
    return (vendorPartQueries[index]?.data as any[]) ?? [];
  }

  const createMutation = useMutation({
    mutationFn: (payload: { unitId: string; partTypeId: string; isReceived: boolean; expectedArrivalDate?: string; receivedDate?: string }) =>
      api.vendorParts.create(payload.unitId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-parts', variables.unitId] });
      toast('Vendor part added', 'success');
      setModalState(null);
    },
    onError: (e: any) => toast(e.message ?? 'Could not add part', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; unitId: string; isReceived?: boolean; expectedArrivalDate?: string; receivedDate?: string }) =>
      api.vendorParts.update(payload.id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-parts', variables.unitId] });
      toast('Updated', 'success');
      setModalState(null);
    },
    onError: (e: any) => toast(e.message ?? 'Could not update', 'error'),
  });

  function handleDrop(event: React.DragEvent, unit: any) {
    event.preventDefault();
    const partTypeId = event.dataTransfer.getData(PART_DRAG_TYPE) || draggedTypeRef.current;
    setDragOverUnitId(null);
    setDraggedTypeId(null);
    draggedTypeRef.current = null;
    if (!partTypeId) return;
    const partType = vendorPartTypes.find((p: any) => p.id === partTypeId);
    if (!partType) return;
    setModalState({ mode: 'create', unitId: unit.id, unitSerial: unit.serialNumber, partTypeId: partType.id, partTypeName: partType.name });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Purchasing"
        description="Drag a part type onto a unit to log whether it's been ordered/received from the vendor, and when."
      />
      <div className="flex-1 overflow-y-auto p-6 grid xl:grid-cols-[260px_1fr] gap-6">
        {/* Vendor part palette */}
        <Card className="p-4 h-fit xl:sticky xl:top-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Vendor Parts</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Drag one onto a unit to log it.</p>
          <div className="space-y-1.5">
            {vendorPartTypes.map((pt: any) => (
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
                {pt.name}
              </div>
            ))}
            {vendorPartTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No vendor part types yet. Add some in Configuration → Part Types (set Source Type to "Vendor").
              </p>
            )}
          </div>
        </Card>

        {/* Units */}
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search units by number or name…"
              className="w-full h-9 pl-8 pr-7 rounded-md border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-52"><Spinner className="w-7 h-7" /></div>
          ) : units.length === 0 ? (
            <EmptyState title="No units found" />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {units.map((unit: any) => {
                const vendorParts = vendorPartsFor(unit.id);
                return (
                  <div
                    key={unit.id}
                    onDragOver={(e) => { e.preventDefault(); setDragOverUnitId(unit.id); }}
                    onDragLeave={() => setDragOverUnitId((c) => (c === unit.id ? null : c))}
                    onDrop={(e) => handleDrop(e, unit)}
                  >
                    <Card className={cn('p-3 transition-all min-h-[140px]', dragOverUnitId === unit.id && 'ring-2 ring-primary bg-primary/5')}>
                      <div className="flex items-center justify-between mb-2">
                        <Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary">{unit.serialNumber}</Link>
                        <Badge variant="muted">{unit.unitType?.name}</Badge>
                      </div>
                      {vendorParts.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No vendor parts logged. Drop one here.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {vendorParts.map((vp: any) => (
                            <button
                              key={vp.id}
                              onClick={() => setModalState({ mode: 'edit', vendorPart: vp })}
                              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-left text-xs"
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                {vp.isReceived ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <Clock3 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                {vp.partType?.name}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {vp.isReceived
                                  ? vp.receivedDate ? new Date(vp.receivedDate).toLocaleDateString() : 'Received'
                                  : vp.expectedArrivalDate ? new Date(vp.expectedArrivalDate).toLocaleDateString() : 'No date set'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ReceiveStatusModal
        state={modalState}
        onClose={() => setModalState(null)}
        onCreate={(payload) => createMutation.mutate(payload)}
        onUpdate={(payload) => updateMutation.mutate(payload)}
        saving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

function ReceiveStatusModal({
  state,
  onClose,
  onCreate,
  onUpdate,
  saving,
}: {
  state: { mode: 'create'; unitId: string; unitSerial: string; partTypeId: string; partTypeName: string } | { mode: 'edit'; vendorPart: any } | null;
  onClose: () => void;
  onCreate: (payload: { unitId: string; partTypeId: string; isReceived: boolean; expectedArrivalDate?: string; receivedDate?: string }) => void;
  onUpdate: (payload: { id: string; unitId: string; isReceived?: boolean; expectedArrivalDate?: string; receivedDate?: string }) => void;
  saving: boolean;
}) {
  const isEdit = state?.mode === 'edit';
  const existing = isEdit ? state.vendorPart : null;

  const [isReceived, setIsReceived] = useState<boolean>(existing?.isReceived ?? false);
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(existing?.expectedArrivalDate ? existing.expectedArrivalDate.slice(0, 10) : '');
  const [receivedDate, setReceivedDate] = useState(existing?.receivedDate ? existing.receivedDate.slice(0, 10) : '');

  // Reset local form state whenever a different item is opened.
  const key = isEdit ? state!.vendorPart.id : state ? `${state.unitId}-${state.partTypeId}` : null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    setIsReceived(existing?.isReceived ?? false);
    setExpectedArrivalDate(existing?.expectedArrivalDate ? existing.expectedArrivalDate.slice(0, 10) : '');
    setReceivedDate(existing?.receivedDate ? existing.receivedDate.slice(0, 10) : '');
  }

  if (!state) return null;
  const partName = isEdit ? state.vendorPart.partType?.name : state.partTypeName;
  const unitSerial = isEdit ? state.vendorPart.unit?.serialNumber : state.unitSerial;

  function handleSave() {
    if (state!.mode === 'create') {
      onCreate({
        unitId: state!.unitId,
        partTypeId: state!.partTypeId,
        isReceived,
        expectedArrivalDate: !isReceived && expectedArrivalDate ? expectedArrivalDate : undefined,
        receivedDate: isReceived && receivedDate ? receivedDate : undefined,
      });
    } else {
      onUpdate({
        id: state!.vendorPart.id,
        unitId: state!.vendorPart.unitId,
        isReceived,
        expectedArrivalDate: !isReceived ? (expectedArrivalDate || undefined) : undefined,
        receivedDate: isReceived ? (receivedDate || undefined) : undefined,
      });
    }
  }

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={`${partName}${unitSerial ? ` — ${unitSerial}` : ''}`}
      description="Has this part been received from the vendor?"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsReceived(false)}
            className={cn('flex-1 py-2.5 rounded-md border text-sm font-medium transition-colors', !isReceived ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-border text-muted-foreground')}
          >
            Not received yet
          </button>
          <button
            type="button"
            onClick={() => setIsReceived(true)}
            className={cn('flex-1 py-2.5 rounded-md border text-sm font-medium transition-colors', isReceived ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : 'border-border text-muted-foreground')}
          >
            Received
          </button>
        </div>

        {!isReceived ? (
          <Input
            label="Expected arrival date"
            type="date"
            value={expectedArrivalDate}
            onChange={(e) => setExpectedArrivalDate(e.target.value)}
          />
        ) : (
          <Input
            label="Date received"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
        )}
        {!isReceived && (
          <p className="text-xs text-muted-foreground">
            You can come back and change this date anytime if the part is delayed.
          </p>
        )}
      </div>
    </Modal>
  );
}
