'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal, Button, toast } from '@/components/shared';

// Self-contained "change your own password" dialog. Encapsulates its own
// state, mutation and validation so the layout only has to render it with
// an open/onClose. Calls POST /auth/change-password, which operates on the
// authenticated user's own account and verifies the current password.
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const reset = () => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); };

  const mutation = useMutation({
    mutationFn: () => api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => { toast('Password changed successfully', 'success'); reset(); onClose(); },
    onError: (err: any) => toast(err?.message ?? 'Could not change password', 'error'),
  });

  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  const field = (label: string, value: string, setter: (v: string) => void, hint?: string, hintError?: boolean) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => setter(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-border bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      {hint && <p className={`text-xs mt-1 ${hintError ? 'text-destructive' : 'text-muted-foreground'}`}>{hint}</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Change password"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!canSubmit} onClick={() => mutation.mutate()}>
            Change password
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {field('Current password', currentPassword, setCurrentPassword)}
        {field('New password', newPassword, setNewPassword, tooShort ? 'Must be at least 8 characters' : undefined, true)}
        {field('Confirm new password', confirmPassword, setConfirmPassword, mismatch ? 'Passwords do not match' : undefined, true)}
        {newPassword.length > 0 && newPassword === currentPassword && (
          <p className="text-xs text-destructive">New password must be different from your current one.</p>
        )}
      </div>
    </Modal>
  );
}
