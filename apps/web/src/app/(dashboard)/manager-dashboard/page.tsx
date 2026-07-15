'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Spinner, toast } from '@/components/shared';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

function DepartmentProgress({ departments = [] }: { departments?: any[] }) {
  if (!departments.length) return <div className="mt-3 text-xs text-muted-foreground">No routed parts yet.</div>;
  return <div className="mt-3 space-y-2">{departments.map((department) => <div key={department.id} className="rounded-md border bg-secondary/20 p-2">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{department.name}</span><span className="text-[11px] text-muted-foreground">{department.parts.length} item(s)</span></div>
    <div className="mt-1 flex flex-wrap gap-1 text-[10px]"><Badge variant="muted">Ready {department.ready}</Badge><Badge variant="outline">Active {department.inProgress}</Badge><Badge variant="outline">Done {department.completed}</Badge>{department.waiting > 0 && <Badge variant="muted">Waiting {department.waiting}</Badge>}</div>
    <div className="mt-2 space-y-1">{department.parts.slice(0, 6).map((part: any) => <div key={part.id} className="flex justify-between gap-2 text-[11px]"><span className="truncate">{part.partType?.name ?? part.identifier}</span><span className="text-muted-foreground whitespace-nowrap">{part.process} · {part.status}</span></div>)}{department.parts.length > 6 && <div className="text-[10px] text-muted-foreground">+{department.parts.length - 6} more</div>}</div>
  </div>)}</div>;
}

// A unit can have several parts moving through different processes within
// its current department at once - there isn't one single "current
// process" the way there's one "current department". Show the distinct
// processes actually active there instead of faking a single value.
function currentProcesses(unit: any): string[] {
  const dept = (unit.departmentProgress ?? []).find((d: any) => d.id === unit.currentDepartmentId);
  if (!dept) return [];
  const names = new Set<string>();
  for (const part of dept.parts) {
    if (['Ready', 'InProgress', 'PendingVerification'].includes(part.status)) names.add(part.process);
  }
  return [...names];
}

export default function ManagerDashboard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['manager-summary'], queryFn: api.units.managerSummary, refetchInterval: 15000 });
  const release = useMutation({ mutationFn: (id: string) => api.units.release(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['manager-summary'] }); toast('Unit released directly to Fabrication', 'success'); }, onError: (e: any) => toast(e.message, 'error') });
  const groups = [{ title: 'Awaiting Production Release', units: data?.awaitingRelease ?? [], action: true }, { title: 'Released — Waiting for Fabrication', units: data?.released ?? [] }, { title: 'In Production by Department', units: data?.started ?? [] }];
  return <div><PageHeader title="Manager Dashboard" description="Release engineering-complete units directly to Fabrication and track every part across departments." />{isLoading ? <div className="p-12 flex justify-center"><Spinner /></div> : <div className="p-6 grid xl:grid-cols-3 gap-5">{groups.map((g) => <Card key={g.title} className="p-4"><div className="flex justify-between mb-4"><h2 className="font-semibold">{g.title}</h2><Badge variant="muted">{g.units.length}</Badge></div><div className="space-y-3">{g.units.length === 0 ? <EmptyState title="No units" /> : g.units.map((u: any) => {
    const processes = currentProcesses(u);
    return <div key={u.id} className="border rounded-lg p-3">
      <div className="flex justify-between gap-3">
        <div>
          <Link href={`/units/${u.id}`} className="font-semibold hover:text-primary">{u.serialNumber}</Link>
          <div className="text-xs text-muted-foreground">{u.unitType?.name}</div>
        </div>
        <span className="text-xs">{u.productionMonth ? format(new Date(u.productionMonth), 'MMMM yyyy') : 'Unscheduled'}</span>
      </div>
      {u.isBlocked && <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1.5 text-[11px] text-destructive"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>Blocked{u.holdReason ? `: ${u.holdReason}` : ''}</span></div>}
      <div className="mt-2 text-xs">Engineering: {u.engineeringStatus.replaceAll(/([A-Z])/g, ' $1').trim()}</div>
      <div className="text-xs">Current department: {u.currentDepartment?.name ?? u.currentStage ?? 'Not released'}</div>
      {processes.length > 0 && <div className="text-xs">Current process: {processes.join(', ')}</div>}
      <div className="text-xs">Shipping: {u.dueDate ? format(new Date(u.dueDate), 'MMM d, yyyy') : 'Not set'}</div>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={Number(u.progressPercentage)} className="flex-1" />
        <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(Number(u.progressPercentage))}%</span>
      </div>
      {g.action && <Button className="mt-3 w-full" size="sm" disabled={u.engineeringStatus !== 'ReleasedToManufacturing' || u.isBlocked} loading={release.isPending && release.variables === u.id} onClick={() => release.mutate(u.id)}>Release Entire Unit to Fabrication</Button>}
      <DepartmentProgress departments={u.departmentProgress} />
    </div>;
  })}</div></Card>)}</div>}</div>;
}
