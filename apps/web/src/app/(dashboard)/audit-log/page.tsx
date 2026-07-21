'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '@/components/shared';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';
import { ScrollText } from 'lucide-react';

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'CREATE', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
];

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-400',
  UPDATE: 'bg-yellow-500/10 text-yellow-400',
  DELETE: 'bg-red-500/10 text-red-400',
};

// Admin-only system audit trail: who did what, to which entity, when.
// Populated automatically for every successful create/update/delete by
// the backend AuditLogInterceptor.
export default function AuditLogPage() {
  const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:audit-log');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', action, entity, page],
    queryFn: () => api.auditLogs.list({ action: action || undefined, entity: entity || undefined, page, pageSize: 50 }),
  });

  const rows = data?.items ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Audit Log"
        description="Every create, update and delete across the system — who did it and when. Admin-only."
        action={
          <ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div style={zoomStyle}>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <Select
              label="Action"
              options={ACTION_OPTIONS}
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="w-40"
            />
            <div className="w-56">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Entity</label>
              <input
                value={entity}
                onChange={(e) => { setEntity(e.target.value); setPage(1); }}
                placeholder="e.g. departments, units"
                className="w-full px-3 py-2 rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : error ? (
            <EmptyState icon={<ScrollText className="w-10 h-10" />} title="Could not load the audit log" description={(error as any)?.message ?? 'You may not have access.'} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<ScrollText className="w-10 h-10" />} title="No activity recorded" description="Create, update and delete actions will appear here as they happen." />
          ) : (
            <>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">When</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Who</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Entity</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Record</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r: any) => (
                        <tr key={r.id} className="hover:bg-accent/40">
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-foreground">{r.actorName}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[r.action] ?? 'bg-muted text-muted-foreground'}`}>{r.action}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-foreground">{r.entity}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground font-mono text-xs">{r.entityId ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">
                    Page {data.page} of {data.totalPages} · {data.total} total
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
