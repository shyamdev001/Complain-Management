import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABEL, PRIORITY_VARIANT, STATUS_LABEL, STATUS_VARIANT } from '@/lib/complaints';
import { cn } from '@/lib/utils';
import type { ComplaintStatus, Priority } from '@/types';

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn('whitespace-nowrap', className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={cn('whitespace-nowrap', className)}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn('whitespace-nowrap border-transparent bg-destructive text-destructive-foreground', className)}>
      <AlertTriangle className="h-3 w-3" />
      Overdue
    </Badge>
  );
}
