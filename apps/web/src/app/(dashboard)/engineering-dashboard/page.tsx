'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, PageHeader, Spinner, toast } from '@/components/shared';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';

const steps = ['NotStarted','SubmittalReceived','DesigningStarted','UnitDesignCompleted','DrawingsCompleted','ProgrammingCompleted','ReleasedToManufacturing'];
const labels: Record<string,string> = { NotStarted:'Not Started', SubmittalReceived:'Submittal Received', DesigningStarted:'Designing Started', UnitDesignCompleted:'Unit Design Completed', DrawingsCompleted:'Drawings Completed', ProgrammingCompleted:'Programming Completed', ReleasedToManufacturing:'Released to Manufacturing' };
export default function EngineeringDashboard() {
 const qc=useQueryClient(); const {data=[],isLoading}=useQuery({queryKey:['engineering-queue'],queryFn:api.units.engineeringQueue});
 const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:designing-dashboard');
 const advance=useMutation({mutationFn:(id:string)=>api.units.advanceEngineering(id),onSuccess:()=>{qc.invalidateQueries({queryKey:['engineering-queue']});qc.invalidateQueries({queryKey:['manager-summary']});toast('Engineering stage advanced','success')},onError:(e:any)=>toast(e.message,'error')});
 return <div className="flex flex-col h-full"><PageHeader title="Designing Dashboard" description="Stages are locked in order and cannot be skipped." />{isLoading?<div className="p-12 flex justify-center"><Spinner/></div>:<div className="flex-1 overflow-y-auto p-6"><div style={zoomStyle} className="space-y-4">{data.map((u:any)=>{const i=steps.indexOf(u.engineeringStatus);const next=steps[i+1];return <Card key={u.id} className="p-4"><div className="flex flex-col lg:flex-row lg:items-center gap-4"><div className="lg:w-56"><Link href={`/units/${u.id}`} className="font-semibold hover:text-primary">{u.serialNumber}</Link><div className="text-xs text-muted-foreground">{u.unitType?.name}</div></div><div className="flex-1 flex gap-1 overflow-x-auto">{steps.map((s,idx)=><div key={s} className={`min-w-28 rounded px-2 py-2 text-center text-[11px] border ${idx<i?'bg-primary/10 border-primary/30':idx===i?'bg-card border-primary':'opacity-45'}`}>{labels[s]}</div>)}</div><div className="lg:w-52">{next?<Button className="w-full" size="sm" loading={advance.isPending&&advance.variables===u.id} onClick={()=>advance.mutate(u.id)}>Mark {labels[next]}</Button>:<Badge variant="outline">Engineering Complete</Badge>}</div></div></Card>})}</div></div>}<ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} /></div>
}
