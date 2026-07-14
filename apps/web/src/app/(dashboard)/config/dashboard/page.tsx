'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Spinner, Card, Select } from '@/components/shared';
import { toast } from '@/components/shared';

export default function DashboardConfigPage() {
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.roles.list(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.departments.list({ isActive: true }),
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard Defaults"
        description="Set default Mission Control view and filters for each role. Users can override these in their personal settings."
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (
          (roles as any[]).map((role) => (
            <RoleDashboardConfig
              key={role.id}
              role={role}
              departments={departments as any[]}
              queryClient={queryClient}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RoleDashboardConfig({
  role,
  departments,
  queryClient,
}: {
  role: any;
  departments: any[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data: roleConfig, isLoading } = useQuery({
    queryKey: ['dashboard-role-config', role.id],
    queryFn: () => api.dashboard.getRoleConfig(role.id),
    staleTime: 30_000,
  });

  const config = (roleConfig?.config as Record<string, unknown>) ?? {};

  const [form, setForm] = useState({
    defaultView: (config.defaultView as string) ?? 'kanban',
    defaultDepartmentFilter: (config.defaultDepartmentFilter as string) ?? 'mine',
    allowCrossDepartmentView: (config.allowCrossDepartmentView as boolean) ?? false,
  });

  // Re-sync local form state once this role's config actually loads
  useEffect(() => {
    if (roleConfig) {
      const c = (roleConfig.config as Record<string, unknown>) ?? {};
      setForm({
        defaultView: (c.defaultView as string) ?? 'kanban',
        defaultDepartmentFilter: (c.defaultDepartmentFilter as string) ?? 'mine',
        allowCrossDepartmentView: (c.allowCrossDepartmentView as boolean) ?? false,
      });
    }
  }, [roleConfig]);

  const saveMutation = useMutation({
    mutationFn: (body: any) => api.dashboard.updateRoleConfig(role.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-role-config', role.id] });
      toast(`${role.name} dashboard defaults updated`, 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center h-24">
        <Spinner className="w-5 h-5" />
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{role.name}</h3>
        {role.isSystem && (
          <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">System</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select label="Default View" value={form.defaultView}
          onChange={(e) => setForm((f) => ({ ...f, defaultView: e.target.value }))}
          options={[{ value: 'kanban', label: 'Kanban Board' }, { value: 'list', label: 'List View' }]}
        />
        <Select label="Default Filter" value={form.defaultDepartmentFilter}
          onChange={(e) => setForm((f) => ({ ...f, defaultDepartmentFilter: e.target.value }))}
          options={[{ value: 'mine', label: 'My Departments' }, { value: 'all', label: 'All Departments' }]}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.allowCrossDepartmentView}
          onChange={(e) => setForm((f) => ({ ...f, allowCrossDepartmentView: e.target.checked }))}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-foreground">Allow viewing other departments</span>
      </label>

      <div className="flex justify-end">
        <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
          Save Defaults
        </Button>
      </div>
    </Card>
  );
}
