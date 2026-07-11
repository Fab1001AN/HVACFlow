'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, Modal, Input, EmptyState, Spinner, Card } from '@/components/shared';
import { Plus, ShieldCheck, ChevronRight, Lock } from 'lucide-react';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.roles.list(),
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.permissions.list(),
    staleTime: Infinity,
  });

  const selectedRole = (roles as any[]).find((r) => r.id === selectedRoleId);
  const selectedPermIds = new Set((selectedRole?.permissions ?? []).map((rp: any) => rp.permission?.id ?? rp.permissionId));

  const createMutation = useMutation({
    mutationFn: (body: any) => api.roles.create(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setCreateOpen(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setSelectedRoleId(data.id);
      toast('Role created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.roles.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSelectedRoleId(null);
      toast('Role deleted', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const togglePermission = async (permId: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    setSaving(true);
    const current = new Set(selectedPermIds);
    if (current.has(permId)) current.delete(permId);
    else current.add(permId);
    try {
      await api.roles.setPermissions(selectedRole.id, Array.from(current) as string[]);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast('Permissions updated', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by category
  const grouped = (permissions as any[]).reduce((acc: Record<string, any[]>, p: any) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Roles &amp; Permissions"
        description="Create roles and assign permission codes. Permission codes come from the database — no hardcoded strings."
        action={<Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreateOpen(true)}>New Role</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          {/* Roles list */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">Roles</h3>
            </div>
            {rolesLoading ? (
              <div className="flex items-center justify-center h-32"><Spinner className="w-5 h-5" /></div>
            ) : (
              <div className="divide-y divide-border">
                {(roles as any[]).map((role) => (
                  <button key={role.id} onClick={() => setSelectedRoleId(role.id)}
                    className={cn('w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors',
                      selectedRoleId === role.id && 'bg-primary/5 border-l-2 border-primary'
                    )}>
                    <ShieldCheck className={cn('w-4 h-4 flex-shrink-0', role.isSystem ? 'text-primary' : 'text-muted-foreground')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{role.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {role.permissions?.length ?? 0} permissions
                        {role.isSystem && <span className="ml-1 text-primary">· System</span>}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Permission matrix */}
          <div className="md:col-span-2">
            {!selectedRole ? (
              <EmptyState title="Select a role" description="Choose a role to view and edit its permissions." icon={<ShieldCheck className="w-10 h-10" />} />
            ) : (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{selectedRole.name}</h3>
                    {selectedRole.isSystem && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Lock className="w-3 h-3" /> System role — cannot be deleted
                      </p>
                    )}
                  </div>
                  {!selectedRole.isSystem && (
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30"
                      onClick={() => { if (confirm(`Delete role "${selectedRole.name}"?`)) deleteMutation.mutate(selectedRole.id); }}>
                      Delete Role
                    </Button>
                  )}
                </div>

                <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
                  {saving && (
                    <div className="px-4 py-2 bg-primary/5 text-xs text-primary border-b border-border flex items-center gap-2">
                      <Spinner className="w-3 h-3" /> Saving…
                    </div>
                  )}

                  {Object.entries(grouped).map(([category, perms]) => (
                    <div key={category} className="border-b border-border last:border-0">
                      <div className="px-4 py-2 bg-secondary/50">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{category}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {(perms as any[]).map((perm) => {
                          const checked = selectedPermIds.has(perm.id);
                          const isAdmin = selectedRole.name === 'Admin';
                          return (
                            <label key={perm.id}
                              className={cn('flex items-center gap-3 px-4 py-2.5', !isAdmin && !selectedRole.isSystem && 'cursor-pointer hover:bg-accent/50')}>
                              <input type="checkbox" checked={isAdmin || checked}
                                disabled={isAdmin || selectedRole.isSystem}
                                onChange={() => togglePermission(perm.id)}
                                className="rounded border-border accent-primary"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{perm.description ?? perm.code}</p>
                                <p className="text-xs text-muted-foreground font-mono">{perm.code}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Role"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={createMutation.isPending} disabled={!newRoleName}
              onClick={() => createMutation.mutate({ name: newRoleName, description: newRoleDesc })}>
              Create Role
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Role Name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Inspector" />
          <Input label="Description" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="QA sign-off authority" />
        </div>
      </Modal>
    </div>
  );
}
