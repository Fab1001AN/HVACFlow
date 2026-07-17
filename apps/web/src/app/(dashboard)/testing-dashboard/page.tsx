'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner, Textarea, toast } from '@/components/shared';
import { useZoom } from '@/hooks/use-zoom';
import { ZoomControls } from '@/components/shared/zoom-controls';
import { CheckCircle2, ClipboardCheck, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TestingDashboardPage() {
  const queryClient = useQueryClient();
  const { zoomPercent, zoomIn, zoomOut, canZoomIn, canZoomOut, zoomStyle } = useZoom('hvacflow:zoom:testing-dashboard');

  const { data: stages = [] } = useQuery({
    queryKey: ['workflow-stages'],
    queryFn: () => api.workflowStages.list(),
    staleTime: 60_000,
  });
  const testingStage = (stages as any[]).find((s) => s.name === 'Testing');
  const earlierStages = testingStage
    ? (stages as any[]).filter((s) => s.sortOrder < testingStage.sortOrder && s.isActive)
    : [];

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['workflow-stages', testingStage?.id, 'units'],
    queryFn: () => api.workflowStages.unitsOnStage(testingStage!.id),
    enabled: !!testingStage,
    refetchInterval: 20_000,
  });

  const advanceMutation = useMutation({
    mutationFn: (unitId: string) => api.units.workflowAdvance(unitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages'] });
      toast('Unit tested - moved to Dispatch', 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not advance unit', 'error'),
  });

  const sendBackMutation = useMutation({
    mutationFn: ({ unitId, targetStageId, reason }: { unitId: string; targetStageId: string; reason: string }) =>
      api.units.workflowSendBack(unitId, targetStageId, reason),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages'] });
      toast(`Sent back to ${updated.currentWorkflowStage?.name}`, 'success');
    },
    onError: (e: any) => toast(e.message ?? 'Could not send back', 'error'),
  });

  if (!testingStage) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Testing" description="Quality checking before a unit ships." />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<ClipboardCheck className="w-10 h-10" />}
            title="Testing stage not set up yet"
            description="An admin needs to create a 'Testing' stage in Configuration → Workflow Stages."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Testing"
        description="Mark a unit tested to send it to Dispatch, or send it back to whichever department needs to fix something - with a note explaining why."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div style={zoomStyle}>
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : units.length === 0 ? (
            <EmptyState title="Nothing waiting on Testing right now" />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {units.map((unit: any) => (
                <TestingUnitCard
                  key={unit.id}
                  unit={unit}
                  earlierStages={earlierStages}
                  onAdvance={() => advanceMutation.mutate(unit.id)}
                  advancing={advanceMutation.isPending && advanceMutation.variables === unit.id}
                  onSendBack={(targetStageId, reason) => sendBackMutation.mutate({ unitId: unit.id, targetStageId, reason })}
                  sendingBack={sendBackMutation.isPending && (sendBackMutation.variables as any)?.unitId === unit.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ZoomControls zoomPercent={zoomPercent} zoomIn={zoomIn} zoomOut={zoomOut} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />
    </div>
  );
}

function TestingUnitCard({
  unit,
  earlierStages,
  onAdvance,
  advancing,
  onSendBack,
  sendingBack,
}: {
  unit: any;
  earlierStages: any[];
  onAdvance: () => void;
  advancing: boolean;
  onSendBack: (targetStageId: string, reason: string) => void;
  sendingBack: boolean;
}) {
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState('');
  const [reason, setReason] = useState('');

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <Link href={`/units/${unit.id}`} className="font-semibold hover:text-primary">{unit.serialNumber}</Link>
        <Badge variant="muted">{unit.unitType?.name}</Badge>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {(unit.parts ?? []).map((p: any) => (
          <span key={p.id} className={cn('text-[11px] px-1.5 py-0.5 rounded', p.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground')}>
            {p.partType?.name}
          </span>
        ))}
      </div>

      {!sendBackOpen ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} loading={advancing} onClick={onAdvance}>
            Unit Tested
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" leftIcon={<Send className="w-3.5 h-3.5" />} onClick={() => setSendBackOpen(true)}>
            Send Back
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Select
            value={targetStageId}
            onChange={(e) => setTargetStageId(e.target.value)}
            options={earlierStages.map((s: any) => ({ value: s.id, label: s.name }))}
            placeholder="Send back to which department?"
          />
          <Textarea
            placeholder="What needs fixing (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => { setSendBackOpen(false); setTargetStageId(''); setReason(''); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!targetStageId || !reason.trim()}
              loading={sendingBack}
              onClick={() => onSendBack(targetStageId, reason)}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
