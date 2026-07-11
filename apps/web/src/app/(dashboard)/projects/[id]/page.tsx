'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Select, Card, ProgressBar } from '@/components/shared';
import { Plus, Package, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { cn, formatDateTime } from '@/lib/utils';
import { OrderStatus } from '@hvacflow/shared-types';
import { PriorityDot } from '@/components/shared/priority-dot';

const ORDER_STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Confirmed: 'bg-blue-500/10 text-blue-400',
  InProduction: 'bg-yellow-500/10 text-yellow-400',
  Completed: 'bg-green-500/10 text-green-400',
  Cancelled: 'bg-red-500/10 text-red-400',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ orderNumber: '', priorityLevelId: '', requestedDeliveryDate: '', notes: '' });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id),
  });

  const { data: priorities } = useQuery({
    queryKey: ['priority-levels'],
    queryFn: () => api.priorityLevels.list({ isActive: true }),
    staleTime: Infinity,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.orders.create(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      setModalOpen(false);
      setForm({ orderNumber: '', priorityLevelId: '', requestedDeliveryDate: '', notes: '' });
      toast('Order created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!project) return null;

  const defaultPriority = priorities?.find((p: any) => p.isDefault);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={project.name}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: project.customer?.name, href: `/customers/${project.customerId}` },
          { label: project.name },
        ]}
        action={
          hasPermission('order:manage') && (
            <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => {
              setForm((f) => ({ ...f, priorityLevelId: defaultPriority?.id ?? '' }));
              setModalOpen(true);
            }}>
              New Order
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-xs text-muted-foreground uppercase tracking-wider">Code</span><p className="font-mono text-foreground mt-0.5">{project.code}</p></div>
          <div><span className="text-xs text-muted-foreground uppercase tracking-wider">Start</span><p className="text-foreground mt-0.5">{project.startDate ? formatDateTime(project.startDate) : '—'}</p></div>
          <div><span className="text-xs text-muted-foreground uppercase tracking-wider">Target End</span><p className="text-foreground mt-0.5">{project.targetEndDate ? formatDateTime(project.targetEndDate) : '—'}</p></div>
          <div><span className="text-xs text-muted-foreground uppercase tracking-wider">Orders</span><p className="text-foreground mt-0.5">{project.orders?.length ?? 0}</p></div>
        </Card>

        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Orders <span className="text-muted-foreground">({project.orders?.length ?? 0})</span></h2>
          {!project.orders?.length ? (
            <EmptyState title="No orders yet" icon={<Package className="w-10 h-10" />}
              action={hasPermission('order:manage') && <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>New Order</Button>}
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Order #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Units</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Delivery</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {project.orders.map((order: any) => (
                    <tr key={order.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`} className="font-medium text-foreground hover:text-primary transition-colors font-mono text-xs">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', ORDER_STATUS_COLORS[order.status])}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityDot color={order.priorityLevel?.color} name={order.priorityLevel?.name} showLabel />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{order._count?.units ?? 0}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{order.requestedDeliveryDate ? formatDateTime(order.requestedDeliveryDate) : '—'}</td>
                      <td className="px-4 py-3"><Link href={`/orders/${order.id}`}><ChevronRight className="w-4 h-4 text-muted-foreground" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Order"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} disabled={!form.orderNumber || !form.priorityLevelId} onClick={() => createMutation.mutate(form)}>
              Create Order
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Order Number" value={form.orderNumber} onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} placeholder="ORD-1042" />
          <Select
            label="Priority"
            value={form.priorityLevelId}
            onChange={(e) => setForm((f) => ({ ...f, priorityLevelId: e.target.value }))}
            options={priorities?.map((p: any) => ({ value: p.id, label: p.name })) ?? []}
            placeholder="Select priority"
          />
          <Input label="Requested Delivery" type="date" value={form.requestedDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, requestedDeliveryDate: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
