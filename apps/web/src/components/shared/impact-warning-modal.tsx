'use client';

import { Modal, Button } from '@/components/shared';
import { AlertTriangle } from 'lucide-react';

interface ImpactWarningModalProps {
  open: boolean;
  title: string;
  lines: string[];
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
}

// Shown before saving a change that would take effect instantly for
// work already in progress on the shop floor (editing a process's
// checklist/verification requirements, toggling a department off,
// etc.) - ProductionTask reads its process/department via a live join,
// not a snapshot, so these changes are never "safe to just save" the
// way editing an inactive template would be.
export function ImpactWarningModal({ open, title, lines, onConfirm, onCancel, confirming }: ImpactWarningModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" loading={confirming} onClick={onConfirm}>
            Yes, save anyway
          </Button>
        </div>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-sm">
          {lines.map((line, i) => (
            <p key={i} className={i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{line}</p>
          ))}
        </div>
      </div>
    </Modal>
  );
}
