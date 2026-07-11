'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Select, Card, ProgressBar } from '@/components/shared';
import { Plus, Package, ChevronRight, CheckCircle, Circle, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { cn, PART_STATUS_BG, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { PriorityDot } from '@/components/shared/priority-dot';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { TaskStatus, PartStatus } from '@hvacflow/shared-types';
import { useWsEvent, useSubscribeUnit } from '@/lib/websocket';

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [partForm, setPartForm] = useState({ partTypeId: '', identifier: '', quantity: 1 });

  useSubscribeUnit(id);

  const { data: unit, isLoading } = useQuery({
    queryKey: ['unit', id],
    queryFn: () => api.units.get(id),
  });

  const { data: partTypes } = useQuery({
    queryKey: ['part-types'],
    queryFn: () => api.partTypes.list({ isActive: true }),
    staleTime: Infinity,
  });

  // Live progress updates
  useWsEvent('unit.progressChanged', (payload) => {
    if (payload.unitId === id) {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
    }
  }, [id]);

  useWsEvent('part.progressChanged', () => {
    queryClient.invalidateQueries({ queryKey: ['unit', id] });
  }, [id]);

  const addPartMutation = useMutation({
    mutationFn: (body: any) => api.parts.create(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', id] });
      setAddPartOpen(false);
      setPartForm({ partTypeId: '', identifier: '', quantity: 1 });
      toast('Part added and tasks generated', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!unit) return null;

  const progress = Number(unit.progressPercentage);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={unit.serialNumber}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: unit.order?.project?.customer?.name, href: `/customers/${unit.order?.project?.customerId}` },
          { label: unit.order?.project?.name, href: `/projects/${unit.order?.projectId}` },
          { label: unit.order?.orderNumber, href: `/orders/${unit.orderId}` },
          { label: unit.serialNumber },
        ]}
        action={
          hasPermission('part:manage') && (
            <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAddPartOpen(true)}>
              Add Part
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Unit summary card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{unit.unitType?.name}</span>
              <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', 'bg-muted text-muted-foreground')}>
                {unit.status}
              </span>
            </div>
            <span className="text-sm font-medium tabular-nums">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} size="md" />
          {unit.specifications && Object.keys(unit.specifications as object).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(unit.specifications as Record<string, string>).map(([k, v]) => (
                <div key={k}>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">{k}</span>
                  <p className="text-sm text-foreground mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Parts */}
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Parts <span className="text-muted-foreground">({unit.parts?.length ?? 0})</span></h2>
          {!unit.parts?.length ? (
            <EmptyState title="No parts yet" icon={<Package className="w-10 h-10" />} />
          ) : (
            <div className="space-y-2">
              {unit.parts.map((part: any) => (
                <PartRow key={part.id} part={part} onTaskClick={setSelectedTaskId} />
              ))}
            </div>
          )}
        </div>

        {/* Unit-level tasks (Testing, Dispatch) */}
        {unit.tasks && unit.tasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">Unit Tasks</h2>
            <Card>
              <div className="divide-y divide-border">
                {unit.tasks.map((task: any) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <TaskStatusIcon status={task.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.processDefinition?.name}</p>
                      <p className="text-xs text-muted-foreground">{task.department?.name}</p>
                    </div>
                    <StatusBadge status={task.status} />
                    {task.assignedUser && (
                      <span className="text-xs text-muted-foreground">{task.assignedUser.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Add Part Modal */}
      <Modal open={addPartOpen} onClose={() => setAddPartOpen(false)} title="Add Part"
        description="Select a part type to add. Production tasks will be generated automatically."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddPartOpen(false)}>Cancel</Button>
            <Button loading={addPartMutation.isPending} disabled={!partForm.partTypeId || !partForm.identifier}
              onClick={() => addPartMutation.mutate(partForm)}>
              Add Part
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select label="Part Type" value={partForm.partTypeId}
            onChange={(e) => setPartForm((f) => ({ ...f, partTypeId: e.target.value }))}
            options={partTypes?.map((pt: any) => ({ value: pt.id, label: pt.name })) ?? []}
            placeholder="Select part type"
          />
          <Input label="Identifier / Tag" value={partForm.identifier}
            onChange={(e) => setPartForm((f) => ({ ...f, identifier: e.target.value }))}
            placeholder="COIL-01"
          />
          <Input label="Quantity" type="number" min={1} value={partForm.quantity}
            onChange={(e) => setPartForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
          />
        </div>
      </Modal>

      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}

function PartRow({ part, onTaskClick }: { part: any; onTaskClick: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const progress = Number(part.progressPercentage);

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform flex-shrink-0', expanded && 'rotate-90')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{part.partType?.name}</span>
            <span className="text-xs text-muted-foreground font-mono">{part.identifier}</span>
          </div>
          <ProgressBar value={progress} showLabel size="sm" />
        </div>
        <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium flex-shrink-0', PART_STATUS_BG[part.status as PartStatus] ?? 'bg-muted text-muted-foreground')}>
          {part.status}
        </span>
      </button>

      {expanded && part.tasks && (
        <div className="border-t border-border divide-y divide-border">
          {part.tasks.map((task: any) => (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left pl-10"
            >
              <TaskStatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{task.processDefinition?.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{task.department?.name}</span>
              </div>
              <StatusBadge status={task.status} />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  if (status === TaskStatus.Completed) return <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />;
  if (status === TaskStatus.InProgress) return <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 animate-pulse" />;
  if (status === TaskStatus.Rejected) return <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  return <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}
