import * as React from 'react';
import { Archive, ArchiveRestore, CheckCircle2, Pencil, RotateCcw, ThumbsDown, ThumbsUp, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PromptDialog } from './shared';
import type { Run } from './ProgressActions';
import { complaintActions, listInstallers } from '@/services/api';
import { CATEGORIES, PRIORITIES, PRIORITY_LABEL } from '@/lib/complaints';
import type { Complaint, Installer, Priority } from '@/types';

type DialogName = 'close' | 'reopen' | 'notResolved' | 'archive' | 'reassign' | 'edit' | null;

function ReassignDialog({
  open,
  onOpenChange,
  complaint,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint;
  run: Run;
}) {
  const [installers, setInstallers] = React.useState<Installer[]>([]);
  const [installerId, setInstallerId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setInstallerId('');
    setReason('');
    listInstallers()
      .then((all) => setInstallers(all.filter((i) => i.active && i.id !== complaint.assignedInstaller)))
      .catch(() => setInstallers([]));
  }, [open, complaint.assignedInstaller]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () => complaintActions.reassign(complaint.id, installerId, reason.trim() || undefined),
      'Complaint reassigned',
    );
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reassign installer</DialogTitle>
            <DialogDescription>
              Currently assigned to {complaint.assignedInstallerName}. It goes back to New and moves to the
              new installer&apos;s Excel sheet.
            </DialogDescription>
          </DialogHeader>
          <FormField label="New installer" required>
            <Select value={installerId} onValueChange={setInstallerId}>
              <SelectTrigger aria-label="New installer">
                <SelectValue placeholder="Select installer" />
              </SelectTrigger>
              <SelectContent>
                {installers.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Reason" htmlFor="reassign-reason">
            <Input id="reassign-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!installerId}>
              Reassign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  open,
  onOpenChange,
  complaint,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint;
  run: Run;
}) {
  const [category, setCategory] = React.useState(complaint.category);
  const [categoryOther, setCategoryOther] = React.useState(complaint.categoryOther ?? '');
  const [description, setDescription] = React.useState(complaint.description);
  const [priority, setPriority] = React.useState<Priority>(complaint.priority);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCategory(complaint.category);
    setCategoryOther(complaint.categoryOther ?? '');
    setDescription(complaint.description);
    setPriority(complaint.priority);
  }, [open, complaint]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () =>
        complaintActions.update(complaint.id, {
          category,
          categoryOther: category === 'Other' ? categoryOther.trim() : undefined,
          description: description.trim(),
          priority,
        }),
      'Complaint updated',
    );
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit complaint</DialogTitle>
            <DialogDescription>Changes are recorded in the complaint history.</DialogDescription>
          </DialogHeader>
          <FormField label="Category" required>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {category === 'Other' && (
            <FormField label="Describe the category" htmlFor="edit-other" required>
              <Input
                id="edit-other"
                value={categoryOther}
                onChange={(e) => setCategoryOther(e.target.value)}
                maxLength={120}
                required
              />
            </FormField>
          )}
          <FormField label="Description" htmlFor="edit-description" required>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={5}
              maxLength={4000}
              required
            />
          </FormField>
          <FormField label="Priority" required hint="Changing priority recalculates the deadlines.">
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Office controls: review a resolution, record the customer's answer, close, reopen, reassign, edit, archive. */
export function AdminActions({ complaint, run, busy }: { complaint: Complaint; run: Run; busy: boolean }) {
  const [dialog, setDialog] = React.useState<DialogName>(null);
  const { status, id } = complaint;
  const isResolved = status === 'RESOLVED_BY_INSTALLER';
  const isClosed = status === 'CLOSED';
  const isOpen = !isResolved && !isClosed;
  const confirmation = complaint.customerConfirmation?.status;
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      {complaint.archived && (
        <Card className="border-destructive/40 bg-destructive/[0.04]">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              <span className="font-bold">Archived.</span> {complaint.archiveReason} Hidden from lists and from the
              installer sheets; the full history is kept.
            </p>
            <Button variant="outline" disabled={busy} onClick={() => run(() => complaintActions.restore(id), 'Complaint restored')}>
              <ArchiveRestore className="h-4 w-4" />
              Restore
            </Button>
          </CardContent>
        </Card>
      )}

      {isResolved && (
        <Card className="border-success/40 bg-success/[0.05]">
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="font-bold">{complaint.assignedInstallerName} has resolved this complaint</p>
              <p className="text-sm text-muted-foreground">
                Review the resolution below, confirm with the customer, then close the complaint - or reopen it if the
                problem is not solved.
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Customer confirmation</p>
              {confirmation === 'CONFIRMED' ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-success">
                  <ThumbsUp className="h-4 w-4" />
                  Customer confirmed the issue is resolved
                  {complaint.customerConfirmation?.source === 'WHATSAPP' ? ' (WhatsApp)' : ''}
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => complaintActions.confirm(id, 'CONFIRMED'), 'Customer confirmation recorded')}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Issue Resolved
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setDialog('notResolved')}>
                    <ThumbsDown className="h-4 w-4" />
                    Issue Still Exists
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="lg" disabled={busy} onClick={() => setDialog('close')}>
                <CheckCircle2 className="h-5 w-5" />
                Close Complaint
              </Button>
              <Button size="lg" variant="outline" disabled={busy} onClick={() => setDialog('reopen')}>
                <RotateCcw className="h-4 w-4" />
                Reopen Complaint
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          {isClosed && (
            <Button variant="outline" disabled={busy} onClick={() => setDialog('reopen')}>
              <RotateCcw className="h-4 w-4" />
              Reopen Complaint
            </Button>
          )}
          {!isClosed && (
            <Button variant="outline" disabled={busy} onClick={() => setDialog('edit')}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {isOpen && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setDialog('reassign')}>
                <UserCog className="h-4 w-4" />
                Reassign Installer
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog('close')}>
                <CheckCircle2 className="h-4 w-4" />
                Close
              </Button>
            </>
          )}
          {!complaint.archived && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive sm:ml-auto"
              disabled={busy}
              onClick={() => setDialog('archive')}
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </CardContent>
      </Card>

      <PromptDialog
        open={dialog === 'close'}
        onOpenChange={close}
        title={`Close ${complaint.complaintNumber}?`}
        description={
          isResolved
            ? 'Closing confirms the issue is resolved. It can still be reopened later if the customer calls back.'
            : 'The installer has not resolved this complaint. Explain why it is being closed (for example, a duplicate).'
        }
        label={isResolved ? 'Closing note' : 'Reason for closing'}
        required={!isResolved}
        confirmLabel="Close Complaint"
        onConfirm={(text) => run(() => complaintActions.close(id, text || undefined), 'Complaint closed')}
      />
      <PromptDialog
        open={dialog === 'reopen'}
        onOpenChange={close}
        title={`Reopen ${complaint.complaintNumber}?`}
        description={`Remember to tell ${complaint.assignedInstallerName} - it will appear on their next sheet. The earlier resolution and all history are kept.`}
        label="Reason"
        placeholder="e.g. Customer says generation is still low"
        required
        confirmLabel="Reopen Complaint"
        onConfirm={(text) => run(() => complaintActions.reopen(id, text), 'Complaint reopened')}
      />
      <PromptDialog
        open={dialog === 'notResolved'}
        onOpenChange={close}
        title="Customer says the issue still exists"
        description={`This reopens the complaint so it goes back on the sheet for ${complaint.assignedInstallerName}.`}
        label="What did the customer say?"
        confirmLabel="Record and reopen"
        onConfirm={(text) =>
          run(() => complaintActions.confirm(id, 'NOT_RESOLVED', text || undefined), 'Recorded - complaint reopened')
        }
      />
      <PromptDialog
        open={dialog === 'archive'}
        onOpenChange={close}
        title={`Archive ${complaint.complaintNumber}?`}
        description="Archiving hides the complaint from lists and from the installer sheets. Nothing is deleted and it can be restored."
        label="Reason"
        required
        destructive
        confirmLabel="Archive"
        onConfirm={(text) => run(() => complaintActions.archive(id, text), 'Complaint archived')}
      />
      <ReassignDialog open={dialog === 'reassign'} onOpenChange={close} complaint={complaint} run={run} />
      <EditDialog open={dialog === 'edit'} onOpenChange={close} complaint={complaint} run={run} />
    </>
  );
}
