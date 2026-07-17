'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, Input, PageHeader, Spinner, toast } from '@/components/shared';
import { Building2 } from 'lucide-react';

export default function GeneralSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgSettings, isLoading } = useQuery({
    queryKey: ['organization-settings'],
    queryFn: () => api.organizationSettings.get(),
  });
  const [name, setName] = useState('');

  useEffect(() => {
    if (orgSettings?.name) setName(orgSettings.name);
  }, [orgSettings?.name]);

  const saveMutation = useMutation({
    mutationFn: (newName: string) => api.organizationSettings.update(newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-settings'] });
      toast('Name updated', 'success');
    },
    onError: (err: any) => toast(err.message ?? 'Could not save', 'error'),
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="General"
        description="Branding for this deployment - shown on the login screen, sidebar, and browser tab."
      />
      <div className="p-6 max-w-lg">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Application name</h2>
              <Badge variant="muted">Currently: {orgSettings?.name}</Badge>
            </div>
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HVACFlow"
              maxLength={100}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                loading={saveMutation.isPending}
                disabled={!name.trim() || name.trim() === orgSettings?.name}
                onClick={() => saveMutation.mutate(name.trim())}
              >
                Save
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
