'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner, toast } from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';

export default function DepartmentWorkPage(){
 const qc=useQueryClient(); const {user,hasPermission}=useAuthStore(); const [departmentId,setDepartmentId]=useState('');
 const {data:departments=[]}=useQuery({queryKey:['departments'],queryFn:()=>api.departments.list({isActive:true})});
 // Regular supervisors are locked to the department(s) they're actually
 // assigned to - "own dashboard, only sees own department" is a stated
 // requirement, not a default that a dropdown can casually override.
 // Admins (config:manage) keep full visibility for oversight/testing.
 const canViewAllDepartments = hasPermission('config:manage');
 const assignedDepartmentIds = (user as any)?.departments?.map((d: any) => d.departmentId) as string[] | undefined;
 const visibleDepartments = canViewAllDepartments || !assignedDepartmentIds?.length
   ? departments
   : departments.filter((d: any) => assignedDepartmentIds.includes(d.id));
 useEffect(()=>{if(departmentId||!visibleDepartments.length)return;setDepartmentId(visibleDepartments[0].id)},[departmentId,visibleDepartments]);
 const selectedDepartment=visibleDepartments.find((d:any)=>d.id===departmentId);
 const {data:manager}=useQuery({queryKey:['manager-summary'],queryFn:api.units.managerSummary,refetchInterval:15000});
 const {data:tasks,isLoading}=useQuery({queryKey:['department-tasks',departmentId],queryFn:()=>api.tasks.list({departmentId,pageSize:500}),enabled:!!departmentId,refetchInterval:10000});
 const start=useMutation({mutationFn:(id:string)=>api.units.startManufacturing(id),onSuccess:()=>{qc.invalidateQueries();toast('Entire unit started; first routed steps are now ready','success')},onError:(e:any)=>toast(e.message,'error')});
 const complete=useMutation({mutationFn:(id:string)=>api.tasks.complete(id),onSuccess:()=>{qc.invalidateQueries();toast('Part completed and advanced to its next routed process','success')},onError:(e:any)=>toast(e.message,'error')});
 const grouped=useMemo(()=>{const m=new Map<string,any>();for(const t of tasks?.data??[]){const u=t.part?.unit??t.unit;if(!u)continue;if(!m.has(u.id))m.set(u.id,{unit:u,tasks:[]});m.get(u.id).tasks.push(t)}return [...m.values()]},[tasks]);
 const fabricationReleased=(manager?.released??[]).filter((u:any)=>!selectedDepartment||selectedDepartment.name.toLowerCase()==='fabrication'||u.currentDepartmentId===departmentId).filter((u:any)=>u.currentDepartment?.name?.toLowerCase()==='fabrication'||u.currentStage==='Waiting for Fabrication');
 return <div><PageHeader title={selectedDepartment?`${selectedDepartment.name} Dashboard`:'Department Work'} description="Each supervisor sees released units and active routed work for their own department."/><div className="p-6 space-y-5">{!canViewAllDepartments && !assignedDepartmentIds?.length ? <EmptyState title="No department assigned" description="Ask an admin to assign you to a department in Configuration → Users before you can see work here." /> : <><Select label="Department" value={departmentId} onChange={e=>setDepartmentId(e.target.value)} options={visibleDepartments.map((d:any)=>({value:d.id,label:d.name}))} placeholder="Select your department" disabled={!canViewAllDepartments && visibleDepartments.length<=1}/>
 {selectedDepartment?.name?.toLowerCase()==='fabrication'&&<Card className="p-4"><div className="flex justify-between mb-3"><h2 className="font-semibold">Released Units Available to Start</h2><Badge variant="muted">{fabricationReleased.length}</Badge></div>{fabricationReleased.length===0?<EmptyState title="No released units"/>:<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{fabricationReleased.map((u:any)=><div key={u.id} className="border rounded-lg p-3"><Link href={`/units/${u.id}`} className="font-semibold hover:text-primary">{u.serialNumber}</Link><div className="text-xs text-muted-foreground mb-3">{u.unitType?.name}</div><Button size="sm" className="w-full" loading={start.isPending&&start.variables===u.id} onClick={()=>start.mutate(u.id)}>Start Entire Unit</Button></div>)}</div>}</Card>}
 {!departmentId?<EmptyState title="Select a department"/>:isLoading?<div className="flex justify-center p-10"><Spinner/></div>:grouped.length===0?<EmptyState title="No work available" description="No routed parts are ready or active in this department."/>:<div className="space-y-4">{grouped.map((g:any)=><Card key={g.unit.id} className="p-4"><div className="flex justify-between mb-3"><div><Link href={`/units/${g.unit.id}`} className="font-semibold hover:text-primary">{g.unit.serialNumber}</Link><div className="text-xs text-muted-foreground">{g.tasks.length} available part/process cards</div></div><Badge variant="outline">{selectedDepartment?.name}</Badge></div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">{g.tasks.map((t:any)=><div key={t.id} className="border rounded-lg p-3"><div className="font-medium text-sm">{t.part?.partType?.name??t.processDefinition?.name}</div><div className="text-xs text-muted-foreground">{t.processDefinition?.name} · {t.status}</div><Button className="mt-3 w-full" size="sm" disabled={!['Ready','InProgress'].includes(t.status)} loading={complete.isPending&&complete.variables===t.id} onClick={()=>complete.mutate(t.id)}>Task Completed</Button></div>)}</div></Card>)}</div>}</></div></div>
}
