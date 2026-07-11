'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Card } from '@/components/shared';
import { Plus, FolderOpen, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { formatDateTime } from '@/lib/utils';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', startDate: '', targetEndDate: '' });

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.customers.get(id),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.projects.create(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setModalOpen(false);
      setForm({ name: '', code: '', startDate: '', targetEndDate: '' });
      toast('Project created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>;
  if (!customer) return null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={customer.name}
        breadcrumbs={[{ label: 'Customers', href: '/customers' }, { label: customer.name }]}
        action={
          hasPermission('project:manage') && (
            <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>
              New Project
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Info card */}
        <Card className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Code</span>
            <p className="font-mono text-foreground mt-0.5">{customer.code}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <p className="text-foreground mt-0.5">{customer.isActive ? 'Active' : 'Inactive'}</p>
          </div>
          {customer.contactInfo && Object.entries(customer.contactInfo as Record<string, string>).map(([k, v]) => (
            <div key={k}>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{k}</span>
              <p className="text-foreground mt-0.5">{v}</p>
            </div>
          ))}
        </Card>

        {/* Projects */}
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">
            Projects <span className="text-muted-foreground">({customer.projects?.length ?? 0})</span>
          </h2>

          {!customer.projects?.length ? (
            <EmptyState
              title="No projects yet"
              description="Create a project to start adding orders and units."
              icon={<FolderOpen className="w-10 h-10" />}
              action={hasPermission('project:manage') && (
                <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>New Project</Button>
              )}
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Orders</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Target End</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customer.projects.map((project: any) => (
                    <tr key={project.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{project.code}</td>
                      <td className="px-4 py-3 text-muted-foreground">{project._count?.orders ?? 0}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {project.targetEndDate ? formatDateTime(project.targetEndDate) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/projects/${project.id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Project"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} disabled={!form.name || !form.code} onClick={() => createMutation.mutate(form)}>
              Create Project
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Project Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="Target End Date" type="date" value={form.targetEndDate} onChange={(e) => setForm((f) => ({ ...f, targetEndDate: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
