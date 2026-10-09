import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, History, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomerForm } from '@/components/CustomerForm';
import { OverdueBadge, StatusBadge } from '@/components/complaints/Badges';
import { Field, Section } from '@/components/complaints/shared';
import { deleteCustomer, getCustomer, updateCustomer } from '@/services/api';
import { useIsSuperAdmin } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/axios';
import { mapsUrl } from '@/lib/complaints';
import { formatDate } from '@/lib/utils';
import type { ComplaintListItem, Customer } from '@/types';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [history, setHistory] = React.useState<ComplaintListItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const isSuper = useIsSuperAdmin();
  const navigate = useNavigate();

  const removeForGood = async () => {
    setDeleting(true);
    try {
      await deleteCustomer(id!);
      toast.success('Customer deleted');
      navigate('/admin/customers', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    setCustomer(null);
    getCustomer(id!)
      .then((data) => {
        if (cancelled) return;
        setCustomer(data.customer);
        setHistory(data.serviceHistory);
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load this customer.')));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <EmptyState title="Customer unavailable" description={error} />;
  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link
          to="/admin/customers"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{customer.name}</h1>
            <p className="font-mono-brand text-sm text-muted-foreground">{customer.customerCode}</p>
          </div>
          <div className="flex gap-2">
            {isSuper && (
              <>
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </>
            )}
            <Button asChild>
              <Link to={`/admin/complaints/new?customer=${customer.id}`}>
                <Plus className="h-4 w-4" />
                New Complaint
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Contact">
          <dl className="grid gap-3">
            <Field label="Mobile" mono>
              <a href={`tel:${customer.mobile}`} className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {customer.mobile}
              </a>
            </Field>
            <Field label="Address">
              {(customer.address || customer.cityVillage) && (
                <a
                  href={mapsUrl(customer.address, customer.cityVillage)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {[customer.address, customer.cityVillage].filter(Boolean).join(', ')}
                </a>
              )}
            </Field>
            <Field label="Village / City">{customer.cityVillage}</Field>
          </dl>
        </Section>

        <Section title="Solar system">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Project ID" mono>
              {customer.projectId}
            </Field>
            <Field label="System size" mono>
              {customer.systemSizeKw !== undefined ? `${customer.systemSizeKw} kW` : ''}
            </Field>
            <Field label="Installed on">{customer.installationDate ? formatDate(customer.installationDate) : ''}</Field>
            <Field label="Installed by">{customer.installedBy}</Field>
            <Field label="Inverter">{customer.inverter}</Field>
            <Field label="Panels">{customer.panels}</Field>
          </dl>
        </Section>
      </div>

      <Section title={`Service history (${history.length})`}>
        {history.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="No complaints yet"
            description="Complaints raised for this customer will be listed here."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border/70">
            {history.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/admin/complaints/${c.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-1 py-3 transition-colors hover:bg-primary/[0.04]"
                >
                  <span className="font-mono-brand text-sm font-semibold">{c.complaintNumber}</span>
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block text-sm font-semibold">{c.category}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.description}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{c.installerName}</span>
                  <span className="flex items-center gap-1.5">
                    {c.isOverdue && <OverdueBadge />}
                    <StatusBadge status={c.status} />
                  </span>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {formatDate(c.closedAt ?? c.resolvedAt ?? c.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {customer.name}?</DialogTitle>
            <DialogDescription>
              {history.length > 0
                ? `This customer has ${history.length} complaint${history.length === 1 ? '' : 's'}. A customer can only be deleted once their complaints have been deleted.`
                : 'The customer record will be removed for good and cannot be brought back.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={deleting} disabled={history.length > 0} onClick={removeForGood}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            customer={customer}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              try {
                setCustomer(await updateCustomer(customer.id, payload));
                setEditing(false);
                toast.success('Customer updated');
              } catch (err) {
                toast.error(getErrorMessage(err));
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
