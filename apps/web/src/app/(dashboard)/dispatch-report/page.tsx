'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, downloadFile } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, toast } from '@/components/shared';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';
import { Download, FileText, Truck } from 'lucide-react';

// Every shipment ever logged, one row per ShipmentRecord - a unit that
// was reshipped after rework shows twice, deliberately, since each row
// is a real time the unit left the building. Access mirrors the
// backend's assertReportAccess(): shipment:manage OR report:view.
export default function DispatchReportPage() {
  const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:dispatch-report');
  const [downloading, setDownloading] = useState<'csv' | 'pdf' | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['shipments', 'dispatch-report'],
    queryFn: () => api.shipments.dispatchReport(),
    refetchInterval: 60_000,
  });

  const handleDownload = async (format: 'csv' | 'pdf') => {
    setDownloading(format);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFile(`/shipments/dispatch-report/${format}`, `dispatch-report-${date}.${format}`);
    } catch (e: any) {
      toast(e.message ?? `Could not download ${format.toUpperCase()}`, 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dispatch Report"
        description="Every shipment logged, newest first. A unit reshipped after rework appears once per shipment."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={() => handleDownload('csv')}
              loading={downloading === 'csv'}
              disabled={downloading !== null}
            >
              Download CSV
            </Button>
            <Button
              variant="secondary"
              leftIcon={<FileText className="w-4 h-4" />}
              onClick={() => handleDownload('pdf')}
              loading={downloading === 'pdf'}
              disabled={downloading !== null}
            >
              Download PDF
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div style={zoomStyle}>
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : error ? (
            <EmptyState
              icon={<Truck className="w-10 h-10" />}
              title="Could not load the report"
              description={(error as any)?.message ?? 'You may not have access to this report.'}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Truck className="w-10 h-10" />}
              title="No shipments logged yet"
              description="Shipments logged from a unit's page or the Dispatch flow will appear here."
            />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Serial #</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Carrier</th>
                    <th className="px-4 py-3 font-medium">Ship Date</th>
                    <th className="px-4 py-3 font-medium">Truck #</th>
                    <th className="px-4 py-3 font-medium">Tracking #</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/units/${r.unitId}`} className="font-medium text-primary hover:underline">
                          {r.unit?.serialNumber ?? '—'}
                        </Link>
                        {r.unit?.displayName && (
                          <div className="text-xs text-muted-foreground">{r.unit.displayName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.unit?.order?.project?.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.unit?.order?.orderNumber ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.carrierName ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.shipDate ? new Date(r.shipDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.truckNumber ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.trackingNumber ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.destinationConfirmed
                          ? <Badge>Confirmed</Badge>
                          : <Badge variant="muted">Pending</Badge>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.createdBy?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
      <ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
    </div>
  );
}
