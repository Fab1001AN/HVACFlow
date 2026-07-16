'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner, toast } from '@/components/shared';
import { TaskCard } from '@/features/mission-control/task-card';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { useAuthStore } from '@/store/auth.store';
import { useWsEvent } from '@/lib/websocket';
import { Rocket } from 'lucide-react';

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

  const { data: board, isLoading } = useQuery({
    queryKey: ['mission-control', 'board', { departmentId }],
    queryFn: () => api.missionControl.board({ departmentId }),
    enabled: !!departmentId,
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
    enabled: canStartUnits,
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
        description="Your department's active work. Tap Task Completed on a card to advance it - no separate start step needed."
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
                          onClick={() => setSelectedTaskId(task.id)}
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
      </div>
      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
