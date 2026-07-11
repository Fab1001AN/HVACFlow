'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Select, Card, ProgressBar } from '@/components/shared';
import { Plus, Box, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';
import { PriorityDot } from '@/components/shared/priority-dot';
import { UNIT_STATUS_BG } from '@/lib/utils';
import { UnitStatus, OrderStatus } from '@hvacflow/shared-types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ unitTypeId: '', serialNumber: '', specifications: {} as Record<string, unknown> });
  const [optionalParts, setOptionalParts] = useState<any[]>([]);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id),
  });

  const { data: unitTypes } = useQuery({
    queryKey: ['unit-types'],
    queryFn: () => api.unitTypes.list({ isActive: true }),
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const result = await api.units.create(id, body);
      if (result.optionalParts?.length > 0) setOptionalParts(result.optionalParts);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setModalOpen(false);
      setForm({ unitTypeId: '', serialNumber: '', specifications: {} });
      toast('Unit created and tasks generated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.orders.confirm(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['order', id] }); toast('Order confirmed', 'success'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.orders.cancel(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['order', id] }); toast('Order cancelled', 'info'); },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!order) return null;

  const canAddUnits = order.status !== OrderStatus.Cancelled && order.status !== OrderStatus.Completed;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={order.orderNumber}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: order.project?.customer?.name, href: `/customers/${order.project?.customer?.id}` },
          { label: order.project?.name, href: `/projects/${order.projectId}` },
          { label: order.orderNumber },
        ]}
        action={
          <div className="flex items-center gap-2">
            {order.status === OrderStatus.Draft && hasPermission('order:manage') && (
              <Button variant="secondary" loading={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />Confirm
              </Button>
            )}
            {[OrderStatus.Draft, OrderStatus.Confirmed].includes(order.status) && hasPermission('order:manage') && (
              <Button variant="outline" className="text-destructive border-destructive/30 hover:border-destructive/60" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                Cancel Order
              </Button>
            )}
            {canAddUnits && hasPermission('unit:manage') && (
              <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>New Unit</Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <p className="text-foreground mt-0.5">{order.status}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority</span>
            <div className="mt-0.5"><PriorityDot color={order.priorityLevel?.color} name={order.priorityLevel?.name} showLabel /></div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Delivery</span>
            <p className="text-foreground mt-0.5">{order.requestedDeliveryDate ? new Date(order.requestedDeliveryDate).toLocaleDateString() : '—'}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Units</span>
            <p className="text-foreground mt-0.5">{order.units?.length ?? 0}</p>
          </div>
        </Card>

        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Units <span className="text-muted-foreground">({order.units?.length ?? 0})</span></h2>
          {!order.units?.length ? (
            <EmptyState title="No units yet" icon={<Box className="w-10 h-10" />}
              action={canAddUnits && hasPermission('unit:manage') && <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>New Unit</Button>}
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Serial</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">Progress</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.units.map((unit: any) => (
                    <tr key={unit.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/units/${unit.id}`} className="font-medium text-foreground hover:text-primary transition-colors font-mono text-xs">
                          {unit.serialNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{unit.unitType?.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', UNIT_STATUS_BG[unit.status as UnitStatus] ?? 'bg-muted text-muted-foreground')}>
                          {unit.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ProgressBar value={Number(unit.progressPercentage)} showLabel size="sm" />
                      </td>
                      <td className="px-4 py-3"><Link href={`/units/${unit.id}`}><ChevronRight className="w-4 h-4 text-muted-foreground" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Unit"
        description="The unit's parts and production tasks will be generated automatically from the type configuration."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} disabled={!form.unitTypeId || !form.serialNumber} onClick={() => createMutation.mutate(form)}>
              Create Unit
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Unit Type"
            value={form.unitTypeId}
            onChange={(e) => setForm((f) => ({ ...f, unitTypeId: e.target.value }))}
            options={unitTypes?.map((ut: any) => ({ value: ut.id, label: ut.name })) ?? []}
            placeholder="Select type"
          />
          <Input label="Serial Number" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} placeholder="HU-2201" />
        </div>
      </Modal>
    </div>
  );
}
