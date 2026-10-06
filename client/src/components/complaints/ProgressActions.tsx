import * as React from 'react';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, Hourglass, PackageSearch, Plus, Trash2, Wrench } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Section } from './shared';
import { complaintActions } from '@/services/api';
import { WORKING_STATUSES, toLocalInputValue } from '@/lib/complaints';
import { formatDate } from '@/lib/utils';
import type { Complaint, Part } from '@/types';

export type Run = (fn: () => Promise<Complaint>, success: string) => Promise<boolean>;

function ScheduleDialog({
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
  const [at, setAt] = React.useState('');
  const [technician, setTechnician] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const current = complaint.scheduledVisit;
    setAt(current ? toLocalInputValue(new Date(current.at)) : '');
    setTechnician(current?.technician ?? '');
    setNote('');
  }, [open, complaint.scheduledVisit]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () =>
        complaintActions.schedule(complaint.id, {
          at: new Date(at).toISOString(),
          technician: technician.trim() || undefined,
          note: note.trim() || undefined,
        }),
      'Visit scheduled',
    );
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{complaint.scheduledVisit ? 'Reschedule visit' : 'Schedule visit'}</DialogTitle>
            <DialogDescription>
              {complaint.customerSnapshot.name}
              {complaint.customerSnapshot.cityVillage ? `, ${complaint.customerSnapshot.cityVillage}` : ''}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Visit date and time" htmlFor="visit-at" required>
            <Input id="visit-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
          </FormField>
          <FormField label="Technician" htmlFor="visit-tech" hint="Who is visiting, if the installer told you">
            <Input id="visit-tech" value={technician} onChange={(e) => setTechnician(e.target.value)} maxLength={120} />
          </FormField>
          <FormField label="Note" htmlFor="visit-note">
            <Textarea
              id="visit-note"
              className="min-h-[80px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!at}>
              Save visit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Where the office records what the installer reports back (by phone or on
 * the returned sheet): accepted, visit scheduled, work started, waiting for parts.
 */
export function ProgressSteps({ complaint, run, busy }: { complaint: Complaint; run: Run; busy: boolean }) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const { status } = complaint;

  if (status === 'NEW') {
    return (
      <Card className="border-info/40 bg-info/[0.04]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold">Waiting for {complaint.assignedInstallerName} to accept</p>
            <p className="text-sm text-muted-foreground">
              Send it on today&apos;s Excel sheet, then mark it accepted once they confirm
              {complaint.responseDueAt ? ` - they should respond by ${formatDate(complaint.responseDueAt, true)}` : ''}.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            loading={busy}
            onClick={() => run(() => complaintActions.accept(complaint.id), 'Marked as accepted')}
          >
            <CheckCircle2 className="h-5 w-5" />
            Mark Accepted
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'RESOLVED_BY_INSTALLER' || status === 'CLOSED') return null;

  return (
    <Card>
      <CardContent className="grid gap-2 p-4 sm:grid-cols-3">
        {status === 'REOPENED' && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive sm:col-span-3">
            This complaint was reopened - the customer reports the issue is not solved.
          </p>
        )}
        <Button variant="outline" disabled={busy} onClick={() => setScheduleOpen(true)}>
          <CalendarClock className="h-4 w-4" />
          {complaint.scheduledVisit ? 'Reschedule Visit' : 'Schedule Visit'}
        </Button>
        <Button
          variant="outline"
          disabled={busy || status === 'IN_PROGRESS'}
          onClick={() => run(() => complaintActions.setStatus(complaint.id, 'IN_PROGRESS'), 'Marked in progress')}
        >
          <Wrench className="h-4 w-4" />
          {status === 'IN_PROGRESS' ? 'In Progress' : 'Start Work'}
        </Button>
        <Button
          variant="outline"
          disabled={busy || status === 'WAITING_FOR_PARTS'}
          onClick={() =>
            run(() => complaintActions.setStatus(complaint.id, 'WAITING_FOR_PARTS'), 'Marked waiting for parts')
          }
        >
          {status === 'WAITING_FOR_PARTS' ? <Hourglass className="h-4 w-4" /> : <PackageSearch className="h-4 w-4" />}
          Waiting for Parts
        </Button>
      </CardContent>
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} complaint={complaint} run={run} />
    </Card>
  );
}

/** What the installer found and did, entered by the office - then "Mark as Resolved". */
export function ServiceReportForm({ complaint, run, busy }: { complaint: Complaint; run: Run; busy: boolean }) {
  const [diagnosis, setDiagnosis] = React.useState(complaint.diagnosis ?? '');
  const [actionTaken, setActionTaken] = React.useState(complaint.actionTaken ?? '');
  const [serviceNotes, setServiceNotes] = React.useState(complaint.serviceNotes ?? '');
  const [parts, setParts] = React.useState<Part[]>(complaint.partsUsed ?? []);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (!WORKING_STATUSES.includes(complaint.status)) return null;

  const report = () => ({
    diagnosis: diagnosis.trim(),
    actionTaken: actionTaken.trim(),
    serviceNotes: serviceNotes.trim(),
    partsUsed: parts.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), quantity: Number(p.quantity) || 1 })),
  });
  const setPart = (index: number, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const tryResolve = () => {
    if (!diagnosis.trim() || !actionTaken.trim()) {
      toast.error('Enter the problem diagnosed and the action taken first');
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <Section title={`Service report from ${complaint.assignedInstallerName}`}>
      <div className="grid gap-4">
        <FormField label="Problem diagnosed" htmlFor="diagnosis" required>
          <Textarea
            id="diagnosis"
            className="min-h-[80px]"
            placeholder="e.g. Loose DC connection"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            maxLength={2000}
          />
        </FormField>
        <FormField label="Action taken" htmlFor="action-taken" required>
          <Textarea
            id="action-taken"
            className="min-h-[80px]"
            placeholder="e.g. DC connection tightened and system tested"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            maxLength={2000}
          />
        </FormField>

        <div className="space-y-2">
          <p className="text-[0.8rem] font-bold uppercase tracking-wide text-foreground/80">Parts / materials used</p>
          {parts.map((part, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Part ${index + 1} name`}
                placeholder="e.g. MC4 connector"
                value={part.name}
                onChange={(e) => setPart(index, { name: e.target.value })}
                maxLength={120}
              />
              <Input
                aria-label={`Part ${index + 1} quantity`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                className="w-20 flex-shrink-0 px-2 text-center"
                value={part.quantity}
                onChange={(e) => setPart(index, { quantity: Number(e.target.value) })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove part ${index + 1}`}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setParts((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="soft" size="sm" onClick={() => setParts((prev) => [...prev, { name: '', quantity: 1 }])}>
            <Plus className="h-4 w-4" />
            Add part
          </Button>
        </div>

        <FormField label="Additional notes" htmlFor="service-notes">
          <Textarea
            id="service-notes"
            className="min-h-[80px]"
            value={serviceNotes}
            onChange={(e) => setServiceNotes(e.target.value)}
            maxLength={2000}
          />
        </FormField>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => complaintActions.saveReport(complaint.id, report()), 'Service report saved')}
          >
            Save report
          </Button>
          <Button size="lg" disabled={busy} onClick={tryResolve}>
            <CheckCircle2 className="h-5 w-5" />
            Mark as Resolved
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {complaint.complaintNumber} as resolved?</DialogTitle>
            <DialogDescription>
              This records that {complaint.assignedInstallerName} has fixed the issue. Confirm with the customer, then
              close the complaint.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Not yet
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                await run(() => complaintActions.resolve(complaint.id, report()), 'Marked as resolved');
                setConfirmOpen(false);
              }}
            >
              Mark as Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
