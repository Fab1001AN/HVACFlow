'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader, Button, EmptyState, Spinner, Modal, Input, Card } from '@/components/shared';
import { Plus, Search, Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/shared';
import { cn } from '@/lib/utils';

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuthStore();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.customers.list({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => editingCustomer ? api.customers.update(editingCustomer.id, body) : api.customers.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setModalOpen(false);
      setEditingCustomer(null);
      setForm({ name: '', code: '' });
      toast(editingCustomer ? 'Customer updated' : 'Customer created', 'success');
    },
    onError: (err: any) => toast(err.message, 'error'),
  });

  const openEdit = (customer: any) => {
    setEditingCustomer(customer);
    setForm({ name: customer.name, code: customer.code });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setForm({ name: '', code: '' });
    setModalOpen(true);
  };

  const customers = data?.data ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Customers"
        description="Manage customer accounts and their projects"
        action={
          hasPermission('customer:manage') && (
            <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              New Customer
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-8 rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Spinner className="w-6 h-6" /></div>
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to get started."
            icon={<Building2 className="w-12 h-12" />}
            action={hasPermission('customer:manage') && (
              <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>New Customer</Button>
            )}
          />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((customer: any) => (
                  <tr key={customer.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${customer.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{customer.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{customer._count?.projects ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                        customer.isActive ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'
                      )}>
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {hasPermission('customer:manage') && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(customer)}>Edit</Button>
                        )}
                        <Link href={`/customers/${customer.id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'New Customer'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              disabled={!form.name || !form.code}
              onClick={() => createMutation.mutate(form)}
            >
              {editingCustomer ? 'Save Changes' : 'Create Customer'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Company Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Acme HVAC Inc." />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="ACME" />
        </div>
      </Modal>
    </div>
  );
}
