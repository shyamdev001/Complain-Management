import * as React from 'react';
import { useParams } from 'react-router-dom';
import { FileWarning } from 'lucide-react';
import { ComplaintDetail } from '@/components/complaints/ComplaintDetail';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { getComplaint } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import type { Complaint } from '@/types';

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [complaint, setComplaint] = React.useState<Complaint | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setComplaint(null);
    setError(null);
    getComplaint(id!)
      .then((c) => !cancelled && setComplaint(c))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load this complaint.')));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <EmptyState icon={<FileWarning className="h-6 w-6" />} title="Complaint unavailable" description={error} />;
  }
  if (!complaint) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-24" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <ComplaintDetail complaint={complaint} onChange={setComplaint} />
  );
}
