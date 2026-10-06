import { Link } from 'react-router-dom';
import { CalendarClock, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { OverdueBadge, PriorityBadge, StatusBadge } from './Badges';
import { cn, formatDate } from '@/lib/utils';
import type { ComplaintListItem } from '@/types';

/** One complaint as a tappable card - the list format used on phones and in dashboard lists. */
export function ComplaintCard({
  complaint,
  to,
  showInstaller,
}: {
  complaint: ComplaintListItem;
  to: string;
  showInstaller?: boolean;
}) {
  return (
    <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card
        className={cn(
          'p-4 transition-shadow hover:shadow-warm-md',
          complaint.isOverdue && 'border-destructive/40 bg-destructive/[0.03]',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono-brand text-sm font-semibold text-foreground">{complaint.complaintNumber}</span>
          <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {complaint.isOverdue && <OverdueBadge />}
            <PriorityBadge priority={complaint.priority} />
            <StatusBadge status={complaint.status} />
          </span>
        </div>

        <p className="mt-2.5 text-base font-bold leading-tight text-foreground">{complaint.customerName}</p>
        {complaint.location && (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {complaint.location}
          </p>
        )}

        <p className="mt-2.5 text-sm font-semibold text-foreground">{complaint.category}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{complaint.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          <span>Created {formatDate(complaint.createdAt)}</span>
          {complaint.dueDate && (
            <span className={cn(complaint.isOverdue && 'font-bold text-destructive')}>
              Due {formatDate(complaint.dueDate, true)}
            </span>
          )}
          {complaint.scheduledVisitAt && complaint.status === 'VISIT_SCHEDULED' && (
            <span className="flex items-center gap-1 font-semibold text-info">
              <CalendarClock className="h-3.5 w-3.5" />
              Visit {formatDate(complaint.scheduledVisitAt, true)}
            </span>
          )}
          {showInstaller && <span className="ml-auto font-semibold text-foreground">{complaint.installerName}</span>}
        </div>
      </Card>
    </Link>
  );
}
