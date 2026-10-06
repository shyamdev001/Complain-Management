import * as React from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { downloadInstallerSheet, listInstallers } from '@/services/api';
import type { Installer } from '@/types';

/** Today's date in India as YYYY-MM-DD, whatever timezone the computer is set to. */
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * The daily hand-off to an installer: pick the installer, keep today's date,
 * download the Excel sheet and send it to them (WhatsApp, email, print).
 */
export function ExportSheetButton({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const [open, setOpen] = React.useState(false);
  const [installers, setInstallers] = React.useState<Installer[]>([]);
  const [installerId, setInstallerId] = React.useState('');
  const [from, setFrom] = React.useState(todayIST);
  const [to, setTo] = React.useState(todayIST);
  const [pending, setPending] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFrom(todayIST());
    setTo(todayIST());
    listInstallers()
      .then(setInstallers)
      .catch(() => toast.error('Could not load installers'));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const filename = await downloadInstallerSheet({ installer: installerId, from, to, pending });
      toast.success(`Downloaded ${filename}`);
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-5 w-5 text-success" />
        Download Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Excel sheet for installer</DialogTitle>
              <DialogDescription>
                One row per complaint with the customer&apos;s name, mobile, address and the complaint, plus empty columns
                for the installer to fill in. Each installer gets only their own complaints.
              </DialogDescription>
            </DialogHeader>

            <FormField label="Installer" required>
              <Select value={installerId} onValueChange={setInstallerId}>
                <SelectTrigger aria-label="Installer">
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

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Complaints from" htmlFor="sheet-from" required>
                <Input id="sheet-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
              </FormField>
              <FormField label="To" htmlFor="sheet-to" required>
                <Input id="sheet-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
              </FormField>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                checked={pending}
                onChange={(e) => setPending(e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Also include older pending complaints</span>
                <span className="block text-muted-foreground">
                  Adds every complaint of this installer that is still open, even if it was created before these dates.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!installerId}>
                Download
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
