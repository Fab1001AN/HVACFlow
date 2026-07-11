'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, EmptyState, Spinner, Card, Avatar } from '@/components/shared';
import { Plus, Pencil, Users } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

const EMPTY_FORM = { name: '', email: '', password: '', isActive: true };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<Array<{ departmentId: string; isPrimary: boolean }>>([]);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.users.list() });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => api.roles.list(), staleTime: Infinity });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.departments.list({ isActive: true }), staleTime: Infinity });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const user = editing
        ? await api.users.update(editing.id, { name: body.name, isActive: body.isActive })
        : await api.users.create({ name: body.name, email: body.email, password: body.password });
      await api.users.setRoles(user.id, selectedRoleIds);
      await api.users.setDepartments(user.id, selectedDepts);
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setSelectedRoleIds([]);
      setSelectedDepts([]);
      toast(editing ? 'User updated' : 'User created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setSelectedRoleIds([]);
    setSelectedDepts([]);
    setModalOpen(true);
  };

  const openEdit = (user: any) => {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: '', isActive: user.isActive });
    setSelectedRoleIds(user.roles?.map((ur: any) => ur.role?.id ?? ur.roleId) ?? []);
    setSelectedDepts(user.departments?.map((ud: any) => ({ departmentId: ud.departmentId, isPrimary: ud.isPrimary })) ?? []);
    setModalOpen(true);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]);
  };

  const toggleDept = (deptId: string) => {
    setSelectedDepts((prev) => {
      if (prev.find((d) => d.departmentId === deptId)) return prev.filter((d) => d.departmentId !== deptId);
      return [...prev, { departmentId: deptId, isPrimary: prev.length === 0 }];
    });
  };

  const setPrimary = (deptId: string) => {
    setSelectedDepts((prev) => prev.map((d) => ({ ...d, isPrimary: d.departmentId === deptId })));
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Users" description="Manage user accounts, roles, and department assignments."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New User</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : (users as any[]).length === 0 ? (
          <EmptyState title="No users yet" icon={<Users className="w-10 h-10" />}
            action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New User</Button>}
          />
        ) : (
          <Card className="overflow-hidden max-w-4xl">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Roles</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Departments</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users as any[]).map((user) => (
                  <tr key={user.id} className="hover:bg-accent/50 group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <div>
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(user.roles ?? []).map((ur: any) => (
                          <span key={ur.roleId ?? ur.role?.id} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {ur.role?.name ?? ur.roleName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(user.departments ?? []).map((ud: any) => (
                          <span key={ud.departmentId} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {ud.department?.name}{ud.isPrimary && ' ★'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-0.5 rounded-md', user.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground')}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => openEdit(user)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="lg"
        title={editing ? `Edit ${editing.name}` : 'New User'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending}
              disabled={!form.name || (!editing && (!form.email || !form.password))}
              onClick={() => createMutation.mutate(form)}>
              {editing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com" disabled={!!editing} />
          </div>
          {!editing && (
            <Input label="Password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters" />
          )}

          {/* Roles */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Roles</label>
            <div className="grid grid-cols-2 gap-2">
              {(roles as any[]).map((role) => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-accent/50 border border-transparent hover:border-border">
                  <input type="checkbox" checked={selectedRoleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)} className="rounded border-border accent-primary" />
                  <span className="text-sm text-foreground">{role.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Departments */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Departments</label>
            <div className="grid grid-cols-2 gap-2">
              {(departments as any[]).map((dept) => {
                const selected = selectedDepts.find((d) => d.departmentId === dept.id);
                const isPrimary = selected?.isPrimary ?? false;
                return (
                  <div key={dept.id} className={cn('flex items-center gap-2 p-2 rounded-md border transition-colors', selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border')}>
                    <input type="checkbox" checked={!!selected}
                      onChange={() => toggleDept(dept.id)} className="rounded border-border accent-primary" />
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color ?? '#6b7280' }} />
                    <span className="text-sm text-foreground flex-1">{dept.name}</span>
                    {selected && (
                      <button onClick={() => setPrimary(dept.id)}
                        className={cn('text-xs px-1.5 rounded', isPrimary ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')}>
                        {isPrimary ? '★ Primary' : 'Set Primary'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded border-border accent-primary" />
              <span className="text-sm text-foreground">Account active</span>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
