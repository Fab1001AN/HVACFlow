'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TaskStatus } from '@hvacflow/shared-types';
import { cn, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import { TaskCard } from '@/features/mission-control/task-card';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { Spinner, EmptyState, Button, Avatar } from '@/components/shared';
import { useWsEvent } from '@/lib/websocket';
import { LayoutGrid, List, Filter, RefreshCw } from 'lucide-react';
import { useQuery as useRQ } from '@tanstack/react-query';

type ViewMode = 'kanban' | 'list';

export default function MissionControlPage() {
  const { user, hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [filters, setFilters] = useState({
    departmentId: '',
    priorityLevelId: '',
    mine: false,
  });

  // Board data
  const { data: board, isLoading, refetch } = useQuery({
    queryKey: ['mission-control', 'board', filters],
    queryFn: () => api.missionControl.board({
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.priorityLevelId ? { priorityLevelId: filters.priorityLevelId } : {}),
      ...(filters.mine ? { mine: 'true' } : {}),
    }),
    refetchInterval: 60_000, // Background refresh every 60s as safety net
  });

  // Summary stats
  const { data: summary } = useQuery({
    queryKey: ['mission-control', 'summary'],
    queryFn: () => api.missionControl.summary(),
    refetchInterval: 30_000,
  });

  // Filter options
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

  // Real-time board updates
  useWsEvent('task.statusChanged', useCallback((payload) => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));

  useWsEvent('task.created', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));

  useWsEvent('task.updated', useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mission-control'] });
  }, [queryClient]));

  const totalActive = summary ? (
    (summary.byStatus[TaskStatus.Ready] ?? 0) +
    (summary.byStatus[TaskStatus.InProgress] ?? 0) +
    (summary.byStatus[TaskStatus.PendingVerification] ?? 0)
  ) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground">Mission Control</h1>
          {summary && (
            <div className="hidden md:flex items-center gap-4 text-sm">
              <StatPill label="Active" value={totalActive} color="text-foreground" />
              <StatPill label="In Progress" value={summary.byStatus[TaskStatus.InProgress] ?? 0} color="text-yellow-400" />
              <StatPill label="Pending Verify" value={summary.byStatus[TaskStatus.PendingVerification] ?? 0} color="text-orange-400" />
              {summary.overdueCount > 0 && (
                <StatPill label="Overdue" value={summary.overdueCount} color="text-red-400" />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'kanban' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => refetch()}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ─── Filters ─────────────────────────────────────────────── */}
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
          className={cn(
            'flex items-center gap-1.5 h-7 px-2.5 rounded border text-xs transition-colors',
            filters.mine
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          My Tasks
        </button>

        {(filters.departmentId || filters.priorityLevelId || filters.mine) && (
          <button
            onClick={() => setFilters({ departmentId: '', priorityLevelId: '', mine: false })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ─── Board / List ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          columns={board?.columns ?? []}
          onTaskClick={setSelectedTaskId}
        />
      ) : (
        <TaskListView
          columns={board?.columns ?? []}
          onTaskClick={setSelectedTaskId}
        />
      )}

      {/* ─── Task Drawer ──────────────────────────────────────────── */}
      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({
  columns,
  onTaskClick,
}: {
  columns: any[];
  onTaskClick: (id: string) => void;
}) {
  if (columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="No departments configured"
          description="Add departments in Configuration to see Kanban columns."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-3 p-4 h-full min-w-max">
        {columns.map((column: any) => (
          <KanbanColumn key={column.department.id} column={column} onTaskClick={onTaskClick} />
        ))}
      </div>
    </div>
  );
}

function KanbanColumn({ column, onTaskClick }: { column: any; onTaskClick: (id: string) => void }) {
  const { department, tasks, taskCount } = column;

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: department.color ?? '#6b7280' }}
          />
          <span className="text-sm font-medium text-foreground">{department.name}</span>
        </div>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
          {taskCount}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-4">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 border border-dashed border-border rounded-lg">
            <span className="text-xs text-muted-foreground">No active tasks</span>
          </div>
        ) : (
          tasks.map((task: any) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function TaskListView({ columns, onTaskClick }: { columns: any[]; onTaskClick: (id: string) => void }) {
  const allTasks = columns.flatMap((c: any) =>
    c.tasks.map((t: any) => ({ ...t, _deptColor: c.department.color })),
  );

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
          {allTasks.map((task: any) => {
            const { cn: cnFn, STATUS_BG: sb, STATUS_LABELS: sl } = { cn, STATUS_BG, STATUS_LABELS };
            return (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="hover:bg-accent cursor-pointer transition-colors"
              >
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('text-sm font-medium tabular-nums', color)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
