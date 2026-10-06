import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Pager } from '@/components/PageHeader';
import { listAuditLogs } from '@/services/api';
import { formatDate } from '@/lib/utils';
import type { AuditLogEntry, Pagination } from '@/types';

const label = (action: string) => action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function AuditLogPage() {
  const [page, setPage] = React.useState(1);
  const [logs, setLogs] = React.useState<AuditLogEntry[] | null>(null);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    listAuditLogs(page)
      .then((data) => {
        if (cancelled) return;
        setLogs(data.logs);
        setPagination(data.pagination);
      })
      .catch(() => !cancelled && setLogs([]));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Audit logs" description="Every important action, who did it, and when. Entries cannot be edited or removed." />
      {!logs ? (
        <Skeleton className="h-96" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>On</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log._id}>
                <TableCell className="font-mono-brand text-xs text-muted-foreground">{formatDate(log.createdAt, true)}</TableCell>
                <TableCell>
                  <span className="font-semibold">{log.actorName}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{log.actorRole.toLowerCase()}</span>
                </TableCell>
                <TableCell className="font-medium">{label(log.action)}</TableCell>
                <TableCell className="font-mono-brand text-[0.8rem]">{log.targetLabel ?? '-'}</TableCell>
                <TableCell className="max-w-[22rem] whitespace-normal text-muted-foreground">{log.details ?? ''}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {pagination && <Pager pagination={pagination} onPage={setPage} />}
    </div>
  );
}
