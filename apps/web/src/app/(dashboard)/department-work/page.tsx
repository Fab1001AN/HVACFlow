'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, ProgressBar, Select, Spinner, toast } from '@/components/shared';
import { TaskCard } from '@/features/mission-control/task-card';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { useAuthStore } from '@/store/auth.store';
import { useWsEvent } from '@/lib/websocket';
import { Rocket, CheckCircle2, Clock3, Hammer, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

// The real interactive tool for a department supervisor - click a
// card's "Task Completed" button to advance it, no side panel needed
// for the common case (that's what Shop Floor Dashboard is for: a
// read-only status board). Start Entire Unit lives here too, since
// that's also an action, not something a passive TV display should do.
export default function SupervisorDashboardPage() {
  const qc = useQueryClient();
  const { user, hasPermission } = useAuthStore();
  const [departmentId, setDepartmentId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const canViewAllDepartments = hasPermission('config:manage');
  const assignedDepartmentIds = (user as any)?.departments?.map((d: any) => d.departmentId) as string[] | undefined;

  const { data: allDepartments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.departments.list({ isActive: true }) });
  const visibleDepartments = canViewAllDepartments || !assignedDepartmentIds?.length
    ? allDepartments
    : allDepartments.filter((d: any) => assignedDepartmentIds.includes(d.id));

  useEffect(() => {
    if (departmentId || !visibleDepartments.length) return;
    setDepartmentId(visibleDepartments[0].id);
  }, [departmentId, visibleDepartments]);

  const selectedDepartment = visibleDepartments.find((d: any) => d.id === departmentId);
  const isAssembly = selectedDepartment?.name?.toLowerCase() === 'assembly';

  const { data: board, isLoading } = useQuery({
    queryKey: ['mission-control', 'board', { departmentId }],
    queryFn: () => api.missionControl.board({ departmentId }),
    enabled: !!departmentId && !isAssembly,
    refetchInterval: 15_000,
  });
  const tasks = board?.columns?.[0]?.tasks ?? [];

  // Group by station (process), same presentation as Shop Floor.
  const stations = new Map<string, any[]>();
  for (const task of tasks) {
    const stationName = task.processDefinition?.name ?? 'Unassigned';
    if (!stations.has(stationName)) stations.set(stationName, []);
    stations.get(stationName)!.push(task);
  }

  const canStartUnits = hasPermission('task:start');
  const { data: managerSummary } = useQuery({
    queryKey: ['manager-summary'],
    queryFn: api.units.managerSummary,
    enabled: canStartUnits && !isAssembly,
    refetchInterval: 30_000,
  });
  const releasedUnits = ((managerSummary?.released ?? []) as any[]).filter(
    (u) => !selectedDepartment || selectedDepartment.name.toLowerCase() === 'fabrication' || u.currentDepartmentId === departmentId,
  );

  const startMutation = useMutation({
    mutationFn: (id: string) => api.units.startManufacturing(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-summary'] });
      qc.invalidateQueries({ queryKey: ['mission-control'] });
      toast('Unit started - first routed steps are now ready', 'success');
    },
    onError: (e: any) => toast(e.message, 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => api.tasks.complete(taskId, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mission-control'] });
      toast('Task completed', 'success');
    },
    onError: (e: any, taskId) => {
      if (e.status === 422) {
        setSelectedTaskId(taskId);
        toast('This task has a checklist to complete first', 'error');
      } else {
        toast(e.message ?? 'Could not complete task', 'error');
      }
    },
  });

  useWsEvent('task.statusChanged', useCallback(() => {
    qc.invalidateQueries({ queryKey: ['mission-control'] });
  }, [qc]));
  useWsEvent('task.created', useCallback(() => {
    qc.invalidateQueries({ queryKey: ['mission-control'] });
  }, [qc]));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={selectedDepartment ? `${selectedDepartment.name} Supervisor Dashboard` : 'Supervisor Dashboard'}
        description={isAssembly ? "Units coming from Fabrication, plus any vendor parts they need. Check vendor parts before starting a build." : "Your department's active work. Tap Task Completed on a card to advance it - no separate start step needed."}
      />
      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        {!canViewAllDepartments && !assignedDepartmentIds?.length ? (
          <EmptyState title="No department assigned" description="Ask an admin to assign you to a department in Configuration → Users." />
        ) : (
          <>
            <Select
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={visibleDepartments.map((d: any) => ({ value: d.id, label: d.name }))}
              placeholder="Select your department"
              disabled={!canViewAllDepartments && visibleDepartments.length <= 1}
            />

            {isAssembly ? (
              <AssemblyView allDepartments={allDepartments} canStartUnits={canStartUnits} />
            ) : (
              <>
                {canStartUnits && releasedUnits.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Rocket className="w-4 h-4 text-primary" />
                      <h2 className="font-semibold">Released Units Available to Start</h2>
                      <Badge variant="muted">{releasedUnits.length}</Badge>
                    </div>
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {releasedUnits.map((u: any) => (
                        <div key={u.id} className="border rounded-lg p-3">
                          <div className="font-semibold">{u.serialNumber}</div>
                          <div className="text-xs text-muted-foreground mb-3">{u.unitType?.name}</div>
                          <Button
                            size="sm"
                            className="w-full"
                            loading={startMutation.isPending && startMutation.variables === u.id}
                            onClick={() => startMutation.mutate(u.id)}
                          >
                            Start Entire Unit
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {!departmentId ? (
                  <EmptyState title="Select a department" />
                ) : isLoading ? (
                  <div className="flex justify-center p-10"><Spinner /></div>
                ) : tasks.length === 0 ? (
                  <EmptyState title="No active work" description="No routed parts are ready or active in this department." />
                ) : (
                  <div className="space-y-6">
                    {[...stations.entries()].map(([stationName, stationTasks]) => (
                      <div key={stationName}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{stationName}</h3>
                          <Badge variant="muted">{stationTasks.length}</Badge>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {stationTasks.map((task: any) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onComplete={(taskId) => completeMutation.mutate(taskId)}
                              completing={completeMutation.isPending && completeMutation.variables === task.id}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {!isAssembly && <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
}

function AssemblyView({ allDepartments, canStartUnits }: { allDepartments: any[]; canStartUnits: boolean }) {
  const [startModalUnit, setStartModalUnit] = useState<any | null>(null);
  const purchasingActive = allDepartments.find((d: any) => d.name === 'Purchasing')?.isActive ?? false;

  const { data, isLoading } = useQuery({
    queryKey: ['units', 'assembly-summary'],
    queryFn: api.units.assemblySummary,
    refetchInterval: 20_000,
  });

  if (isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;

  const wip = data?.wip ?? [];
  const upcoming = data?.upcoming ?? [];

  return (
    <div className="space-y-8">
      <UnitSection title="WIP" description="Assembly has started building these units" units={wip} showProgress />
      <UnitSection
        title="Upcoming Units"
        description="Parts arriving from Fabrication and vendors - not started yet"
        units={upcoming}
        onStartClick={canStartUnits ? setStartModalUnit : undefined}
      />
      <StartBuildingModal unit={startModalUnit} purchasingActive={purchasingActive} onClose={() => setStartModalUnit(null)} />
    </div>
  );
}

function UnitSection({
  title,
  description,
  units,
  showProgress,
  onStartClick,
}: {
  title: string;
  description: string;
  units: any[];
  showProgress?: boolean;
  onStartClick?: (unit: any) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="muted">{units.length}</Badge>
      </div>
      {units.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {units.map((unit: any) => (
            <AssemblyUnitCard key={unit.id} unit={unit} showProgress={showProgress} onStartClick={onStartClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssemblyUnitCard({ unit, showProgress, onStartClick }: { unit: any; showProgress?: boolean; onStartClick?: (unit: any) => void }) {
  const vendorParts = unit.vendorParts ?? [];
  const parts = unit.parts ?? [];
  const receivedCount = vendorParts.filter((vp: any) => vp.isReceived).length;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/units/${unit.id}`} className="font-semibold text-sm hover:text-primary">{unit.serialNumber}</Link>
        {unit.assignedTeamName ? <Badge variant="outline">{unit.assignedTeamName}</Badge> : <Badge variant="muted">{unit.unitType?.name}</Badge>}
      </div>

      {showProgress && (
        <div className="mb-3">
          <ProgressBar value={Number(unit.progressPercentage)} showLabel size="sm" />
        </div>
      )}

      <div className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">From Fabrication</p>
        <div className="flex flex-wrap gap-1">
          {parts.length === 0 ? (
            <span className="text-xs text-muted-foreground">None yet</span>
          ) : (
            parts.map((p: any) => (
              <span key={p.id} className="text-[11px] px-1.5 py-0.5 rounded bg-secondary">{p.partType?.name}</span>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Vendor Parts{vendorParts.length > 0 ? ` (${receivedCount}/${vendorParts.length})` : ''}
        </p>
        <div className="flex flex-wrap gap-1">
          {vendorParts.length === 0 ? (
            <span className="text-xs text-muted-foreground">None logged</span>
          ) : (
            vendorParts.map((vp: any) => (
              <span key={vp.id} className={cn('text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1', vp.isReceived ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600')}>
                {vp.isReceived ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
                {vp.partType?.name}
              </span>
            ))
          )}
        </div>
      </div>

      {onStartClick && (
        <Button size="sm" className="w-full mt-3" onClick={() => onStartClick(unit)}>
          <Hammer className="w-3.5 h-3.5" />
          Start Building Unit
        </Button>
      )}
    </Card>
  );
}

function StartBuildingModal({ unit, purchasingActive, onClose }: { unit: any | null; purchasingActive: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState('');

  const { data: vendorPartTypes = [] } = useQuery({
    queryKey: ['part-types', 'vendor'],
    queryFn: () => api.partTypes.list({ isActive: true, sourceType: 'Vendor' }),
    enabled: !!unit && !purchasingActive,
    staleTime: 60_000,
  });

  const addVendorPartMutation = useMutation({
    mutationFn: (payload: { partTypeId: string }) => api.vendorParts.create(unit!.id, { partTypeId: payload.partTypeId, isReceived: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units', 'assembly-summary'] });
      toast('Vendor part logged as needed - not received yet', 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not add part', 'error'),
  });

  const startMutation = useMutation({
    mutationFn: () => api.units.startAssembly(unit!.id, teamName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units', 'assembly-summary'] });
      toast(`Building started for ${unit!.serialNumber}`, 'success');
      setTeamName('');
      onClose();
    },
    onError: (e: any) => toast(e.message ?? 'Could not start', 'error'),
  });

  if (!unit) return null;
  const vendorParts = unit.vendorParts ?? [];
  const pendingVendorParts = vendorParts.filter((vp: any) => !vp.isReceived);
  const existingVendorTypeIds = new Set(vendorParts.map((vp: any) => vp.partTypeId));

  return (
    <Modal
      open={!!unit}
      onClose={onClose}
      title={`Start Building — ${unit.serialNumber}`}
      description="Check vendor parts before you start, then assign a team."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={startMutation.isPending} disabled={!teamName.trim()} onClick={() => startMutation.mutate()}>
            Start Building Unit
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vendor parts check</p>
          {vendorParts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vendor parts logged for this unit yet.</p>
          ) : (
            <div className="space-y-1">
              {vendorParts.map((vp: any) => (
                <div key={vp.id} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm', vp.isReceived ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
                  {vp.isReceived ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /> : <Clock3 className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />}
                  <span className="flex-1">{vp.partType?.name}</span>
                  <span className="text-xs text-muted-foreground">{vp.isReceived ? 'Received' : 'Pending'}</span>
                </div>
              ))}
            </div>
          )}
          {pendingVendorParts.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">{pendingVendorParts.length} part(s) still pending from the vendor - you can still start, but double-check with Purchasing.</p>
          )}
        </div>

        {/* Purchasing is toggled off - Assembly has to flag what's needed instead. */}
        {!purchasingActive && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Purchasing is off - log any vendor parts this unit needs
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vendorPartTypes.filter((pt: any) => !existingVendorTypeIds.has(pt.id)).map((pt: any) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => addVendorPartMutation.mutate({ partTypeId: pt.id })}
                  disabled={addVendorPartMutation.isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Package className="w-3 h-3" /> + {pt.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Adds it as "not received yet" - edit the date any time from this unit's page.</p>
          </div>
        )}

        <Input label="Team assigned to this unit" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Team A" />
      </div>
    </Modal>
  );
}
