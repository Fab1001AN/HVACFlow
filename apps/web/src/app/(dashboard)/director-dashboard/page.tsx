'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Spinner } from '@/components/shared';
import { AlertTriangle, Boxes, CheckCircle2, Clock3, Factory, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function DirectorDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['director-summary'], queryFn: api.units.directorSummary, refetchInterval: 30_000 });
  if (isLoading) return <div className="h-full flex items-center justify-center"><Spinner className="w-7 h-7" /></div>;
  const totals = data?.totals ?? {};
  const units = data?.units ?? [];

  const cards = [
    { label: 'Active Units', value: totals.active ?? 0, icon: Boxes, className: 'text-blue-400 bg-blue-500/10' },
    { label: 'Blocked', value: totals.blocked ?? 0, icon: AlertTriangle, className: 'text-red-400 bg-red-500/10' },
    { label: 'Delayed', value: totals.delayed ?? 0, icon: Clock3, className: 'text-amber-400 bg-amber-500/10' },
    { label: 'In Testing', value: totals.testing ?? 0, icon: CheckCircle2, className: 'text-violet-400 bg-violet-500/10' },
    { label: 'Ready to Dispatch', value: totals.readyToDispatch ?? 0, icon: Truck, className: 'text-emerald-400 bg-emerald-500/10' },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Director of Manufacturing" description="Live view of every unit, bottleneck, delay, and department workload." />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          {cards.map(({ label, value, icon: Icon, className }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center justify-between"><div className={cn('p-2 rounded-lg', className)}><Icon className="w-5 h-5" /></div><span className="text-2xl font-semibold tabular-nums">{value}</span></div>
              <p className="mt-3 text-xs text-muted-foreground">{label}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2 overflow-hidden">
            <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-semibold">Units requiring attention</h2></div>
            {!units.length ? <EmptyState title="No active units" /> : (
              <div className="divide-y divide-border">
                {units.slice(0, 20).map((unit: any) => {
                  const overdue = unit.dueDate && new Date(unit.dueDate) < new Date();
                  return (
                    <Link key={unit.id} href={`/units/${unit.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                      <div className={cn('w-2 h-10 rounded-full', unit.isBlocked ? 'bg-red-500' : overdue ? 'bg-amber-500' : 'bg-blue-500')} />
                      <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">{unit.serialNumber}</span><Badge variant="outline">{unit.unitType?.code}</Badge>{unit.isBlocked && <Badge className="bg-red-500/10 text-red-400">Blocked</Badge>}</div><p className="text-xs text-muted-foreground truncate mt-0.5">{unit.holdReason || unit.currentStage || unit.currentDepartment?.name || 'Engineering'}</p></div>
                      <div className="w-36 hidden md:block"><ProgressBar value={Number(unit.progressPercentage)} showLabel size="sm" /></div>
                      <div className="text-right text-xs text-muted-foreground w-20">{unit.dueDate ? format(new Date(unit.dueDate), 'MMM d') : 'No due date'}</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Factory className="w-4 h-4" /><h2 className="text-sm font-semibold">Department workload</h2></div>
            <div className="p-4 space-y-4">
              {(data?.departmentLoad ?? []).map((row: any) => {
                const max = Math.max(...(data?.departmentLoad ?? []).map((x: any) => x.openTasks), 1);
                return <div key={row.departmentId}><div className="flex justify-between text-xs mb-1.5"><span>{row.department?.name ?? 'Unknown'}</span><span className="text-muted-foreground">{row.openTasks} open</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(row.openTasks / max) * 100}%`, backgroundColor: row.department?.color ?? '#3b82f6' }} /></div></div>;
              })}
              {!data?.departmentLoad?.length && <p className="text-sm text-muted-foreground">No open production tasks.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
