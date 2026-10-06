import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { PriorityBadge } from '@/components/complaints/Badges';
import { getSla, saveSla } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import { PRIORITIES } from '@/lib/complaints';
import type { Priority } from '@/types';

type Draft = Record<Priority, { responseHours: string; resolutionHours: string }>;

export function SettingsPage() {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getSla()
      .then((sla) =>
        setDraft(
          Object.fromEntries(
            PRIORITIES.map((p) => [
              p,
              {
                responseHours: String(sla[p].responseHours),
                resolutionHours: sla[p].resolutionHours === null ? '' : String(sla[p].resolutionHours),
              },
            ]),
          ) as Draft,
        ),
      )
      .catch(() => toast.error('Could not load SLA settings'));
  }, []);

  const set = (priority: Priority, key: 'responseHours' | 'resolutionHours', value: string) =>
    setDraft((prev) => (prev ? { ...prev, [priority]: { ...prev[priority], [key]: value } } : prev));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await saveSla(
        Object.fromEntries(
          PRIORITIES.map((p) => [
            p,
            {
              responseHours: Number(draft[p].responseHours),
              resolutionHours: draft[p].resolutionHours === '' ? null : Number(draft[p].resolutionHours),
            },
          ]),
        ) as Record<Priority, { responseHours: number; resolutionHours: number | null }>,
      );
      toast.success('SLA targets saved. They apply to complaints created from now on.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="SLA settings"
        description="Internal targets for how quickly installers should respond to and resolve a complaint. A complaint that misses a target is flagged as overdue."
      />

      {!draft ? (
        <Skeleton className="h-80" />
      ) : (
        <form onSubmit={submit}>
          <Card>
            <CardContent className="p-5">
              <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-x-3 gap-y-4">
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Priority</span>
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Respond within (hours)</span>
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Resolve within (hours)</span>
                {PRIORITIES.map((priority) => (
                  <React.Fragment key={priority}>
                    <div>
                      <PriorityBadge priority={priority} />
                    </div>
                    <Input
                      aria-label={`${priority} response hours`}
                      type="number"
                      inputMode="decimal"
                      min={0.25}
                      step="any"
                      required
                      value={draft[priority].responseHours}
                      onChange={(e) => set(priority, 'responseHours', e.target.value)}
                    />
                    <Input
                      aria-label={`${priority} resolution hours`}
                      type="number"
                      inputMode="decimal"
                      min={0.25}
                      step="any"
                      placeholder="No target"
                      value={draft[priority].resolutionHours}
                      onChange={(e) => set(priority, 'resolutionHours', e.target.value)}
                    />
                  </React.Fragment>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Leave "Resolve within" empty for no resolution target. Changes do not move the deadlines of existing complaints.
              </p>
              <div className="mt-5 flex justify-end">
                <Button type="submit" loading={saving}>
                  Save targets
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
