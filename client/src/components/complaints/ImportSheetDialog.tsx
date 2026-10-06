import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, FileUp, Upload } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importInstallerSheet, type ImportOutcome, type ImportResult } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import { cn } from '@/lib/utils';

const OUTCOME: Record<ImportOutcome, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  RESOLVED: { label: 'Resolved', variant: 'success' },
  UPDATED: { label: 'Updated', variant: 'info' },
  NO_CHANGE: { label: 'Nothing filled in', variant: 'secondary' },
  SKIPPED: { label: 'Skipped', variant: 'warning' },
};

/**
 * Reads back the sheet an installer filled in. Two steps on purpose: the file
 * is first checked and shown row by row, and nothing is saved until the
 * office presses Apply.
 */
export function ImportSheetButton({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // After a real import the lists and counts behind the dialog are out of date.
      if (result?.applied) navigate(0);
      reset();
    }
  };

  const check = async (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    setResult(null);
    setBusy(true);
    try {
      setResult(await importInstallerSheet(chosen, false));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not read this file.'));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const applied = await importInstallerSheet(file, true);
      setResult(applied);
      toast.success(`${applied.summary.RESOLVED + applied.summary.UPDATED} complaint(s) updated from the sheet`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  const toApply = result ? result.summary.RESOLVED + result.summary.UPDATED : 0;

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <FileUp className="h-5 w-5 text-info" />
        Import Filled Sheet
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import the sheet the installer filled in</DialogTitle>
            <DialogDescription>
              Upload the Excel file the installer sent back. Their visit date, problem found, work done, parts and remarks
              are entered against each complaint. You see every change before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            aria-label="Filled-in Excel sheet"
            onChange={(e) => {
              void check(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {!result && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
            >
              <Upload className="h-7 w-7 text-primary" />
              <span className="font-semibold">{busy ? 'Reading the sheet...' : 'Choose the Excel file'}</span>
              <span className="text-sm text-muted-foreground">
                The .xlsx file downloaded from this system, with the installer&apos;s columns filled in.
              </span>
            </button>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">{file?.name}</span>
                {result.installerName && <span className="text-muted-foreground">Installer: {result.installerName}</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(Object.keys(OUTCOME) as ImportOutcome[]).map((key) => (
                  <div key={key} className="rounded-xl bg-secondary/60 px-1 py-2.5">
                    <p className="font-mono-brand text-xl font-semibold tabular-nums leading-none">{result.summary[key]}</p>
                    <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                      {OUTCOME[key].label}
                    </p>
                  </div>
                ))}
              </div>

              <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {result.rows.map((row) => (
                  <li
                    key={row.row}
                    className={cn('rounded-xl border border-border/70 p-3', row.outcome === 'NO_CHANGE' && 'opacity-70')}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-brand text-sm font-semibold">{row.complaintNumber}</span>
                      {row.customerName && <span className="text-sm text-muted-foreground">{row.customerName}</span>}
                      <Badge variant={OUTCOME[row.outcome].variant} className="ml-auto">
                        {OUTCOME[row.outcome].label}
                      </Badge>
                    </div>
                    {row.changes.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                        {row.changes.map((change, i) => (
                          <li key={i} className="break-words">
                            {change}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.reason && <p className="mt-1.5 text-sm text-muted-foreground">{row.reason}</p>}
                    {row.warnings.map((warning, i) => (
                      <p key={i} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-warning-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        {warning}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>

              {result.applied ? (
                <p className="rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
                  Saved. Complaints marked Resolved are now waiting for your review -{' '}
                  <Link
                    to="/admin/complaints?status=RESOLVED_BY_INSTALLER"
                    className="underline underline-offset-4"
                    onClick={() => setOpen(false)}
                  >
                    open them
                  </Link>
                  .
                </p>
              ) : (
                toApply === 0 && (
                  <p className="rounded-xl bg-secondary/60 px-3 py-2.5 text-sm text-muted-foreground">
                    There is nothing to import from this file.
                  </p>
                )
              )}
            </>
          )}

          <DialogFooter>
            {result && !result.applied && (
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                Choose another file
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {result?.applied ? 'Done' : 'Cancel'}
            </Button>
            {result && !result.applied && (
              <Button type="button" onClick={apply} loading={busy} disabled={toApply === 0}>
                Apply {toApply} update{toApply === 1 ? '' : 's'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
