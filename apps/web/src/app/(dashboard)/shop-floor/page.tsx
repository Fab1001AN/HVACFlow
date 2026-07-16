'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TaskStatus } from '@hvacflow/shared-types';
import { cn, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import { TaskCard } from '@/features/mission-control/task-card';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { Spinner, EmptyState, Avatar } from '@/components/shared';
import { useWsEvent } from '@/lib/websocket';
import { LayoutGrid, List, Filter, RefreshCw, Maximize, Minimize } from 'lucide-react';

// Shop Floor Dashboard - a live, read-only status board (renamed from
// Mission Control). Meant to run on a TV on the shop floor so everyone
// can see what's happening at a glance - not a page anyone clicks
// through to do work on. Starting units and completing tasks moved to
// the Supervisor Dashboard (/department-work), which is the actual
// interactive tool for that.
type ViewMode = 'kanban' | 'list';

function ShopFloorBoard() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [tvMode, setTvMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [filters, setFilters] = useState({
    departmentId: searchParams.get('departmentId') ?? '',
    priorityLevelId: '',
    mine: false,
  });

  useEffect(() => {
    const fromUrl = searchParams.get('departmentId');
    if (fromUrl) setFilters((f) => (f.departmentId === fromUrl ? f : { ...f, departmentId: fromUrl }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('departmentId')]);

  const { data: board, isLoading, refetch } = useQuery({
    queryKey: ['mission-control', 'board', filters],
    queryFn: () => api.missionControl.board({
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.priorityLevelId ? { priorityLevelId: filters.priorityLevelId } : {}),
      ...(filters.mine ? { mine: 'true' } : {}),
    }),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['mission-control', 'summary'],
    queryFn: () => api.missionControl.summary(),
    refetchInterval: 30_000,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list({ isActive: true }),
    staleTime: Infinity,
  });

  const { data: priorityLevels } = useQuery({
    queryKey: ['priority-levels'],
    queryFn: () => api.priorityLevels.list({ isActive: true }),
    staleTime: Infinity,
  });

  useWsEvent('task.statusChanged', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));
  useWsEvent('task.created', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));
  useWsEvent('task.updated', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));

  // Fullscreen on this page's own container hides the sidebar/header
  // chrome around it (they're siblings in the DOM, not children of this
  // element) - the closest thing to a real "TV kiosk mode" without a
  // separate unauthenticated public route.
  const toggleTvMode = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setTvMode(true);
    } else {
      document.exitFullscreen?.();
      setTvMode(false);
    }
  };
  useEffect(() => {
    const onFsChange = () => setTvMode(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const totalActive = summary ? (
    (summary.byStatus[TaskStatus.Ready] ?? 0) +
    (summary.byStatus[TaskStatus.InProgress] ?? 0) +
    (summary.byStatus[TaskStatus.PendingVerification] ?? 0)
  ) : 0;

  return (
    <div ref={containerRef} className={cn('flex flex-col h-full bg-background', tvMode && 'p-2')}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className={cn('flex items-center justify-between px-6 border-b border-border flex-shrink-0', tvMode ? 'py-6' : 'py-4')}>
        <div className="flex items-center gap-4">
          <h1 className={cn('font-semibold text-foreground', tvMode ? 'text-3xl' : 'text-lg')}>Shop Floor Dashboard</h1>
          {summary && (
            <div className={cn('hidden md:flex items-center gap-4', tvMode ? 'text-xl gap-6' : 'text-sm')}>
              <StatPill label="Active" value={totalActive} color="text-foreground" big={tvMode} />
              <StatPill label="In Progress" value={summary.byStatus[TaskStatus.InProgress] ?? 0} color="text-yellow-400" big={tvMode} />
              <StatPill label="Pending Verify" value={summary.byStatus[TaskStatus.PendingVerification] ?? 0} color="text-orange-400" big={tvMode} />
              {summary.overdueCount > 0 && (
                <StatPill label="Overdue" value={summary.overdueCount} color="text-red-400" big={tvMode} />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!tvMode && (
            <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
              <button onClick={() => setViewMode('kanban')} className={cn('p-1.5 rounded transition-colors', viewMode === 'kanban' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {!tvMode && (
            <button onClick={() => refetch()} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </button>
          )}
          <button
            onClick={toggleTvMode}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={tvMode ? 'Exit TV mode' : 'TV mode - fullscreen for a shop-floor display'}
          >
            {tvMode ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            {!tvMode && 'TV Mode'}
          </button>
        </div>
      </div>

      {/* ─── Filters (hidden in TV mode - nobody's clicking a wall-mounted screen) ─── */}
      {!tvMode && (
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-card/50 flex-shrink-0 overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}
            className="h-7 px-2 rounded border border-border bg-secondary text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="">All Departments</option>
            {departments?.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={filters.priorityLevelId}
            onChange={(e) => setFilters((f) => ({ ...f, priorityLevelId: e.target.value }))}
            className="h-7 px-2 rounded border border-border bg-secondary text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="">All Priorities</option>
            {priorityLevels?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
            className={cn('flex items-center gap-1.5 h-7 px-2.5 rounded border text-xs transition-colors', filters.mine ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            My Tasks
          </button>
          {(filters.departmentId || filters.priorityLevelId || filters.mine) && (
            <button onClick={() => setFilters({ departmentId: '', priorityLevelId: '', mine: false })} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      )}

      {/* ─── Board / List (read-only - no complete/start actions here) ─── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner className="w-8 h-8" /></div>
      ) : viewMode === 'kanban' || tvMode ? (
        <KanbanBoard columns={board?.columns ?? []} onTaskClick={setSelectedTaskId} big={tvMode} />
      ) : (
        <TaskListView columns={board?.columns ?? []} onTaskClick={setSelectedTaskId} />
      )}

      {!tvMode && <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
}

export default function ShopFloorPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>}>
      <ShopFloorBoard />
    </Suspense>
  );
}

// ─── Kanban Board (read-only) ──────────────────────────────────────────────────

function KanbanBoard({ columns, onTaskClick, big }: { columns: any[]; onTaskClick: (id: string) => void; big?: boolean }) {
  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState title="No departments configured" description="Add departments in Configuration to see columns." />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-x-auto">
      <div className={cn('flex gap-3 p-4 h-full min-w-max', big && 'gap-4 p-6')}>
        {columns.map((column: any) => (
          <KanbanColumn key={column.department.id} column={column} onTaskClick={onTaskClick} big={big} />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ column, onTaskClick, big }: { column: any; onTaskClick: (id: string) => void; big?: boolean }) {
  const { department, tasks, taskCount } = column;

  const stations = new Map<string, any[]>();
  for (const task of tasks) {
    const stationName = task.processDefinition?.name ?? 'Unassigned';
    if (!stations.has(stationName)) stations.set(stationName, []);
    stations.get(stationName)!.push(task);
  }

  return (
    <div className={cn('flex flex-col flex-shrink-0', big ? 'w-96' : 'w-72')}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className={cn('rounded-full flex-shrink-0', big ? 'w-4 h-4' : 'w-2.5 h-2.5')} style={{ backgroundColor: department.color ?? '#6b7280' }} />
          <span className={cn('font-medium text-foreground', big ? 'text-xl' : 'text-sm')}>{department.name}</span>
        </div>
        <span className={cn('text-muted-foreground bg-muted rounded-full tabular-nums', big ? 'text-base px-3 py-1' : 'text-xs px-2 py-0.5')}>{taskCount}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {tasks.length === 0 ? (
          <div className={cn('flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground', big ? 'h-24 text-base' : 'h-20 text-xs')}>
            No active tasks
          </div>
        ) : (
          [...stations.entries()].map(([stationName, stationTasks]) => (
            <div key={stationName}>
              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className={cn('font-semibold uppercase tracking-wider text-muted-foreground', big ? 'text-sm' : 'text-[11px]')}>{stationName}</span>
                <span className={cn('text-muted-foreground tabular-nums', big ? 'text-xs' : 'text-[10px]')}>{stationTasks.length}</span>
              </div>
              <div className="space-y-2">
                {stationTasks.map((task: any) => (
                  <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function TaskListView({ columns, onTaskClick }: { columns: any[]; onTaskClick: (id: string) => void }) {
  const allTasks = columns.flatMap((c: any) => c.tasks.map((t: any) => ({ ...t, _deptColor: c.department.color })));

  if (allTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState title="No active tasks" description="All tasks are either pending or completed." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Process</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Unit / Part</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {allTasks.map((task: any) => (
            <tr key={task.id} onClick={() => onTaskClick(task.id)} className="hover:bg-accent cursor-pointer transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task._deptColor ?? '#6b7280' }} />
                  <span className="font-medium text-foreground">{task.processDefinition?.name}</span>
                </div>
                <span className="text-xs text-muted-foreground ml-4">{task.department?.name}</span>
              </td>
              <td className="px-4 py-3">
                <p className="text-foreground">{task.part?.unit?.serialNumber ?? task.unit?.serialNumber}</p>
                {task.part && <p className="text-xs text-muted-foreground">{task.part.partType?.name}</p>}
              </td>
              <td className="px-4 py-3">
                <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BG[task.status as TaskStatus])}>
                  {STATUS_LABELS[task.status as TaskStatus]}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.priorityLevel?.color ?? '#6b7280' }} />
                  <span className="text-xs text-muted-foreground">{task.priorityLevel?.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                {task.assignedUser ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar name={task.assignedUser.name} size="xs" />
                    <span className="text-xs text-foreground">{task.assignedUser.name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatPill({ label, value, color, big }: { label: string; value: number; color: string; big?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('font-medium tabular-nums', color, big ? 'text-2xl' : 'text-sm')}>{value}</span>
      <span className={cn('text-muted-foreground', big ? 'text-base' : 'text-xs')}>{label}</span>
    </div>
  );
}
