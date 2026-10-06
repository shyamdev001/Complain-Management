import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { OverdueBadge, PriorityBadge, StatusBadge } from './Badges';
import { Field, Section } from './shared';
import { PhotoGrid, PhotoLightbox, PhotoSection } from './PhotoSection';
import { ProgressSteps, ServiceReportForm, type Run } from './ProgressActions';
import { AdminActions } from './AdminActions';
import { complaintActions } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import { formatHours, mapsUrl } from '@/lib/complaints';
import { cn, formatDate } from '@/lib/utils';
import type { Complaint, Photo, Resolution } from '@/types';

function ResolutionCard({
  complaint,
  resolution,
  number,
  latest,
}: {
  complaint: Complaint;
  resolution: Resolution;
  number: number;
  latest: boolean;
}) {
  const [open, setOpen] = React.useState<Photo | null>(null);
  const photos = complaint.photos.filter((p) => resolution.photoIds.includes(p.id));
  const before = photos.filter((p) => p.kind === 'BEFORE');
  const after = photos.filter((p) => p.kind === 'AFTER');

  return (
    <div className={cn('rounded-xl border p-4', latest ? 'border-success/40 bg-success/[0.04]' : 'border-border/70')}>
      <p className="text-sm font-bold">
        {complaint.resolutions.length > 1 ? `Resolution ${number}` : 'Resolution'}
        <span className="ml-2 font-normal text-muted-foreground">
          {resolution.installerName}
          {resolution.resolvedByName !== resolution.installerName ? ` (${resolution.resolvedByName})` : ''} -{' '}
          {formatDate(resolution.resolvedAt, true)}
        </span>
      </p>
      <dl className="mt-3 grid gap-3">
        <Field label="Installer diagnosis">{resolution.diagnosis}</Field>
        <Field label="Work performed">{resolution.actionTaken}</Field>
        <Field label="Parts / materials used">
          {resolution.partsUsed.length ? (
            <ul className="space-y-0.5">
              {resolution.partsUsed.map((part, i) => (
                <li key={i}>
                  {part.name} <span className="font-mono-brand text-muted-foreground">x {part.quantity}</span>
                </li>
              ))}
            </ul>
          ) : (
            'None'
          )}
        </Field>
        {resolution.notes && <Field label="Notes">{resolution.notes}</Field>}
        {before.length > 0 && (
          <Field label="Before photos">
            <div className="mt-1">
              <PhotoGrid complaintId={complaint.id} photos={before} onOpen={setOpen} />
            </div>
          </Field>
        )}
        {after.length > 0 && (
          <Field label="After photos">
            <div className="mt-1">
              <PhotoGrid complaintId={complaint.id} photos={after} onOpen={setOpen} />
            </div>
          </Field>
        )}
      </dl>
      <PhotoLightbox complaintId={complaint.id} photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Timeline({ complaint }: { complaint: Complaint }) {
  const entries = [...complaint.timeline].reverse();
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => {
        const isNote = entry.type === 'NOTE' || entry.type === 'INTERNAL_NOTE';
        return (
          <li key={entry._id} className="relative pl-6">
            <span
              className={cn(
                'absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full',
                isNote ? 'bg-info' : 'bg-primary',
              )}
            />
            {index < entries.length - 1 && <span className="absolute bottom-[-1rem] left-[4.5px] top-5 w-px bg-border" />}
            <p className="font-mono-brand text-xs text-muted-foreground">{formatDate(entry.at, true)}</p>
            {isNote ? (
              <>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Note - {entry.actorName}
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-secondary/60 px-3 py-2 text-sm">{entry.message}</p>
              </>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-foreground">{entry.message}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NoteBox({ complaint, run, busy }: { complaint: Complaint; run: Run; busy: boolean }) {
  const [text, setText] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => complaintActions.addNote(complaint.id, text.trim()), 'Note added');
    if (ok) setText('');
  };

  return (
    <form onSubmit={submit} className="mb-5 space-y-2">
      <Textarea
        aria-label="Add a note"
        className="min-h-[70px]"
        placeholder="Add a note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Notes stay in the office - they are not put on the Excel sheet.</span>
        <Button type="submit" size="sm" variant="soft" disabled={busy || !text.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}

/**
 * The full complaint page: office decisions, the installer progress the office
 * records, the service report, photos and the complete history.
 */
export function ComplaintDetail({
  complaint,
  onChange,
}: {
  complaint: Complaint;
  onChange: (complaint: Complaint) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const c = complaint;
  const snap = c.customerSnapshot;

  const run: Run = async (fn, success) => {
    setBusy(true);
    try {
      onChange(await fn());
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const categoryLabel = c.category === 'Other' && c.categoryOther ? `Other: ${c.categoryOther}` : c.category;
  const resolutions = c.resolutions.map((r, i) => ({ r, number: i + 1 })).reverse();
  const canUploadPhotos = c.status !== 'CLOSED';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <Link
          to="/admin/complaints"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to complaints
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-mono-brand text-xl font-semibold tracking-tight sm:text-2xl">{c.complaintNumber}</h1>
          <StatusBadge status={c.status} />
          <PriorityBadge priority={c.priority} />
          {c.isOverdue && <OverdueBadge />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Created {formatDate(c.createdAt, true)} by {c.createdByName}
          {c.lastExportedAt && <> - sheet last downloaded {formatDate(c.lastExportedAt, true)}</>}
          {c.dueDate && (
            <>
              {' - '}
              <span className={cn(c.isOverdue && 'font-bold text-destructive')}>due {formatDate(c.dueDate, true)}</span>
            </>
          )}
        </p>
      </div>

      <AdminActions complaint={c} run={run} busy={busy} />
      {!c.archived && <ProgressSteps complaint={c} run={run} busy={busy} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Complaint">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">{categoryLabel}</Field>
              <Field label="Assigned installer">
                {c.assignedInstallerName}
                <span className="block text-xs font-normal text-muted-foreground">since {formatDate(c.assignedAt, true)}</span>
              </Field>
              <Field label="Customer complaint" className="sm:col-span-2">
                <span className="whitespace-pre-wrap text-base font-normal leading-relaxed">{c.description}</span>
              </Field>
              {c.acceptedAt && (
                <Field label="Accepted">
                  {formatDate(c.acceptedAt, true)}
                  <span className="block text-xs font-normal text-muted-foreground">by {c.acceptedByName}</span>
                </Field>
              )}
              {c.reopenedCount > 0 && <Field label="Times reopened">{c.reopenedCount}</Field>}
              {c.resolutionTimeHours !== null && (
                <Field label="Resolution time">{formatHours(c.resolutionTimeHours)}</Field>
              )}
            </dl>
          </Section>

          {c.scheduledVisit && (
            <Section title="Scheduled visit">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-info/10 p-2.5 text-info">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-bold">{formatDate(c.scheduledVisit.at, true)}</p>
                  {c.scheduledVisit.technician && (
                    <p className="text-sm text-muted-foreground">Technician: {c.scheduledVisit.technician}</p>
                  )}
                  {c.scheduledVisit.note && <p className="mt-1 text-sm">{c.scheduledVisit.note}</p>}
                </div>
              </div>
            </Section>
          )}

          {!c.archived && <ServiceReportForm complaint={c} run={run} busy={busy} />}

          {resolutions.length > 0 && (
            <Section title={resolutions.length > 1 ? 'Resolution history' : 'Resolution'}>
              <div className="space-y-3">
                {resolutions.map(({ r, number }, i) => (
                  <ResolutionCard key={number} complaint={c} resolution={r} number={number} latest={i === 0} />
                ))}
              </div>
            </Section>
          )}

          <PhotoSection complaint={c} canUpload={canUploadPhotos} onChange={onChange} />
        </div>

        <div className="space-y-4">
          <Section title="Customer">
            <p className="text-lg font-bold leading-tight">{snap.name}</p>
            <div className="mt-3 grid gap-2">
              <Button asChild size="lg" className="w-full justify-start">
                <a href={`tel:${snap.mobile}`}>
                  <Phone className="h-5 w-5" />
                  <span className="font-mono-brand">{snap.mobile}</span>
                </a>
              </Button>
              {(snap.address || snap.cityVillage) && (
                <Button asChild variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-2.5 text-left">
                  <a href={mapsUrl(snap.address, snap.cityVillage)} target="_blank" rel="noreferrer">
                    <MapPin className="h-5 w-5 flex-shrink-0 text-primary" />
                    <span>{[snap.address, snap.cityVillage].filter(Boolean).join(', ')}</span>
                  </a>
                </Button>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Customer ID" mono>
                <Link to={`/admin/customers/${c.customer}`} className="text-primary underline-offset-4 hover:underline">
                  {snap.customerCode}
                </Link>
              </Field>
              <Field label="Project ID" mono>
                {snap.projectId}
              </Field>
              <Field label="Village / City">{snap.cityVillage}</Field>
            </dl>
          </Section>

          <Section title="Solar system">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="System size" mono>
                {snap.systemSizeKw !== undefined && snap.systemSizeKw !== null ? `${snap.systemSizeKw} kW` : ''}
              </Field>
              <Field label="Installed on">{snap.installationDate ? formatDate(snap.installationDate) : ''}</Field>
              <Field label="Inverter">{snap.inverter}</Field>
              <Field label="Panels">{snap.panels}</Field>
            </dl>
          </Section>

          <Section title="Service timeline">
            {!c.archived && c.status !== 'CLOSED' && <NoteBox complaint={c} run={run} busy={busy} />}
            <Timeline complaint={c} />
          </Section>
        </div>
      </div>
    </div>
  );
}
