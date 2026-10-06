import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Pagination } from '@/types';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A count that links to the matching filtered list. */
export function StatTile({
  label,
  value,
  to,
  alert,
}: {
  label: string;
  value: number | undefined;
  to: string;
  /** Draws attention when the count is non-zero (used for Overdue). */
  alert?: boolean;
}) {
  const hot = alert && Boolean(value);
  return (
    <Link to={to} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card
        className={cn(
          'h-full p-4 transition-shadow hover:shadow-warm-md',
          hot && 'border-destructive bg-destructive text-destructive-foreground',
        )}
      >
        <p
          className={cn(
            'text-[0.68rem] font-bold uppercase leading-tight tracking-wide',
            hot ? 'text-destructive-foreground/90' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        <p className="mt-2 font-mono-brand text-3xl font-semibold tabular-nums leading-none">{value ?? '-'}</p>
      </Card>
    </Link>
  );
}

export function Pager({ pagination, onPage }: { pagination: Pagination; onPage: (page: number) => void }) {
  if (pagination.total === 0) return null;
  const from = (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.total, pagination.page * pagination.limit);
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {from}-{to} of {pagination.total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.pages}
          onClick={() => onPage(pagination.page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
