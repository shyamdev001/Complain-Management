import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, StatTile } from '@/components/PageHeader';
import { ComplaintCard } from '@/components/complaints/ComplaintCard';
import { ExportSheetButton } from '@/components/complaints/ExportSheetDialog';
import { ImportSheetButton } from '@/components/complaints/ImportSheetDialog';
import { getComplaintStats, listComplaints } from '@/services/api';
import { formatHours } from '@/lib/complaints';
import { cn } from '@/lib/utils';
import type { ComplaintListItem, ComplaintStats } from '@/types';

const list = '/admin/complaints';

export function AdminDashboardPage() {
  const [stats, setStats] = React.useState<ComplaintStats | null>(null);
  const [overdue, setOverdue] = React.useState<ComplaintListItem[]>([]);
  const [toReview, setToReview] = React.useState<ComplaintListItem[]>([]);

  React.useEffect(() => {
    getComplaintStats().then(setStats).catch(() => undefined);
    listComplaints({ overdue: true, limit: 6 }).then((d) => setOverdue(d.complaints)).catch(() => undefined);
    listComplaints({ status: 'RESOLVED_BY_INSTALLER', limit: 6 }).then((d) => setToReview(d.complaints)).catch(() => undefined);
  }, []);

  const s = stats?.byStatus;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Service dashboard"
        description="Every customer complaint, who is handling it, and what needs attention."
        action={
          <div className="flex flex-wrap gap-2">
            <ExportSheetButton size="lg" />
            <ImportSheetButton size="lg" />
            <Button asChild size="lg">
              <Link to="/admin/complaints/new">
                <Plus className="h-5 w-5" />
                New Complaint
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total complaints" value={stats?.total} to={list} />
        <StatTile label="New" value={s?.NEW} to={`${list}?status=NEW`} />
        <StatTile label="Accepted" value={s?.ACCEPTED} to={`${list}?status=ACCEPTED`} />
        <StatTile label="Visit scheduled" value={s?.VISIT_SCHEDULED} to={`${list}?status=VISIT_SCHEDULED`} />
        <StatTile label="In progress" value={s?.IN_PROGRESS} to={`${list}?status=IN_PROGRESS`} />
        <StatTile label="Waiting for parts" value={s?.WAITING_FOR_PARTS} to={`${list}?status=WAITING_FOR_PARTS`} />
        <StatTile label="Reopened" value={s?.REOPENED} to={`${list}?status=REOPENED`} />
        <StatTile label="Resolved by installer" value={s?.RESOLVED_BY_INSTALLER} to={`${list}?status=RESOLVED_BY_INSTALLER`} />
        <StatTile label="Closed" value={s?.CLOSED} to={`${list}?status=CLOSED`} />
        <StatTile label="Overdue" value={stats?.overdue} to={`${list}?overdue=true`} alert />
      </div>

      <h2 className="mb-3 mt-8 text-lg">Installer breakdown</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {!stats && [0, 1].map((i) => <Skeleton key={i} className="h-40" />)}
        {stats?.installers?.map((installer) => (
          <Card key={installer.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                {installer.name}
                <Link
                  to={`${list}?installer=${installer.id}`}
                  className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  View complaints
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Open', value: installer.open, to: `${list}?installer=${installer.id}&open=true` },
                  { label: 'Resolved', value: installer.resolved + installer.closed, to: `${list}?installer=${installer.id}` },
                  { label: 'Overdue', value: installer.overdue, to: `${list}?installer=${installer.id}&overdue=true`, alert: true },
                  { label: 'Reopened', value: installer.reopened, to: `${list}?installer=${installer.id}` },
                ].map((cell) => (
                  <Link
                    key={cell.label}
                    to={cell.to}
                    className={cn(
                      'rounded-xl bg-secondary/60 px-1 py-3 transition-colors hover:bg-secondary',
                      cell.alert && cell.value > 0 && 'bg-destructive/10 text-destructive hover:bg-destructive/15',
                    )}
                  >
                    <dd className="font-mono-brand text-2xl font-semibold tabular-nums leading-none">{cell.value}</dd>
                    <dt className="mt-1.5 text-[0.65rem] font-bold uppercase tracking-wide opacity-80">{cell.label}</dt>
                  </Link>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                Average time to resolve:{' '}
                <span className="font-semibold text-foreground">{formatHours(installer.avgResolutionHours)}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={cn('flex items-center gap-2 text-lg', overdue.length > 0 && 'text-destructive')}>
              <AlertTriangle className="h-5 w-5" />
              Overdue
            </h2>
            {overdue.length > 0 && (
              <Link to={`${list}?overdue=true`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                View all
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {overdue.map((c) => (
              <ComplaintCard key={c.id} complaint={c} to={`${list}/${c.id}`} showInstaller />
            ))}
            {stats && overdue.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No overdue complaints.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg">Waiting for your review</h2>
            {toReview.length > 0 && (
              <Link
                to={`${list}?status=RESOLVED_BY_INSTALLER`}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                View all
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {toReview.map((c) => (
              <ComplaintCard key={c.id} complaint={c} to={`${list}/${c.id}`} showInstaller />
            ))}
            {stats && toReview.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                Nothing waiting to be reviewed.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
