'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Spinner } from '@/components/shared';
import { AlertTriangle, Boxes, CheckCircle2, Clock3, Factory, Truck, ShieldOff } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';

export default function DirectorDashboardPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('director:view');
  const { data, isLoading } = useQuery({ queryKey: ['director-summary'], queryFn: api.units.directorSummary, refetchInterval: 30_000, enabled: canView });
  const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:director-dashboard');

  if (!canView) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<ShieldOff className="w-10 h-10" />}
          title="Director access required"
          description="This dashboard is restricted to Sales Director, Manufacturing Director, and Admin accounts."
        />
      </div>
    );
  }

  if (isLoading) return <div className="h-full flex items-center justify-center"><Spinner className="w-7 h-7" /></div>;
  const totals = data?.totals ?? {};
  const units = data?.units ?? [];

  // Upcoming: hasn't started production yet (still in Engineering, or
  // released/planned/handed-off but no department has actually begun
  // work). WIP: actively in production (Started).
  const upcomingUnits = units.filter((u: any) => u.productionReleaseStatus !== 'Started');
  const wipUnits = units.filter((u: any) => u.productionReleaseStatus === 'Started');

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
        <div style={zoomStyle} className="space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          {cards.map(({ label, value, icon: Icon, className }) => (
            <Card key={label} className="p-4">
              <div className="flex items-center justify-between"><div className={cn('p-2 rounded-lg', className)}><Icon className="w-5 h-5" /></div><span className="text-2xl font-semibold tabular-nums">{value}</span></div>
              <p className="mt-3 text-xs text-muted-foreground">{label}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <UnitListCard title="Upcoming Units" description="Not yet started in production" units={upcomingUnits} />
            <UnitListCard title="WIP Units" description="Actively in production" units={wipUnits} />
          </div>

          <Card className="overflow-hidden h-fit">
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
      <ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
    </div>
  );
}

function UnitListCard({ title, description, units }: { title: string; description: string; units: any[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="muted">{units.length}</Badge>
      </div>
      {!units.length ? <div className="p-6"><EmptyState title="Nothing here" /></div> : (
        <div className="divide-y divide-border">
          {units.slice(0, 20).map((unit: any) => {
            const overdue = unit.dueDate && new Date(unit.dueDate) < new Date();
            return (
              <Link key={unit.id} href={`/units/${unit.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40">
                <div className={cn('w-2 h-10 rounded-full', unit.isBlocked ? 'bg-red-500' : overdue ? 'bg-amber-500' : 'bg-blue-500')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium text-sm">{unit.serialNumber}</span><Badge variant="outline">{unit.unitType?.code}</Badge>{unit.isBlocked && <Badge className="bg-red-500/10 text-red-400">Blocked</Badge>}</div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{unit.holdReason || unit.currentStage || unit.currentDepartment?.name || 'Detailing'}</p>
                  {unit.latestDelayComment && (
                    <p className="text-xs text-amber-500 truncate mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      {unit.latestDelayComment.userName}: {unit.latestDelayComment.message}
                    </p>
                  )}
                </div>
                <div className="w-36 hidden md:block"><ProgressBar value={Number(unit.progressPercentage)} showLabel size="sm" /></div>
                <div className="text-right text-xs text-muted-foreground w-20">{unit.dueDate ? format(new Date(unit.dueDate), 'MMM d') : 'No due date'}</div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
