import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Search, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CustomerForm } from '@/components/CustomerForm';
import { StatusBadge } from '@/components/complaints/Badges';
import { Field } from '@/components/complaints/shared';
import { useDebounce } from '@/hooks/useDebounce';
import { createComplaint, createCustomer, getCustomer, listCustomers, listInstallers } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import { CATEGORIES, PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL } from '@/lib/complaints';
import { cn, formatDate } from '@/lib/utils';
import type { ComplaintListItem, Customer, Installer, Priority } from '@/types';

/**
 * One screen, top to bottom, built to be filled in while the customer is on
 * the phone: find the customer, type what they said, pick priority and
 * installer, create.
 */
export function NewComplaintPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);

  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search.trim(), 250);
  const [results, setResults] = React.useState<Customer[] | null>(null);
  const [adding, setAdding] = React.useState(false);

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [openComplaints, setOpenComplaints] = React.useState<ComplaintListItem[]>([]);

  const [installers, setInstallers] = React.useState<Installer[]>([]);
  const [category, setCategory] = React.useState('');
  const [categoryOther, setCategoryOther] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<Priority>('NORMAL');
  const [installerId, setInstallerId] = React.useState('');
  /** Name of the installer that was filled in from the customer's record, while the office has not changed it. */
  const [autoInstaller, setAutoInstaller] = React.useState('');

  // Pre-select the installer who did this customer's installation. It is only a
  // starting point: the office can pick another, and customers with no (or an
  // unknown) installer on record leave the field empty so it must be chosen.
  React.useEffect(() => {
    const recorded = customer?.installedBy?.trim().toLowerCase();
    const match = recorded ? installers.find((i) => i.name.toLowerCase() === recorded) : undefined;
    setInstallerId(match?.id ?? '');
    setAutoInstaller(match?.name ?? '');
  }, [customer, installers]);
  const [submitting, setSubmitting] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const selectCustomer = React.useCallback(async (id: string) => {
    try {
      const data = await getCustomer(id);
      setCustomer(data.customer);
      setOpenComplaints(data.openComplaints);
      setAdding(false);
      setSearch('');
      setResults(null);
      requestAnimationFrame(() => descriptionRef.current?.focus());
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load this customer'));
    }
  }, []);

  React.useEffect(() => {
    listInstallers()
      .then((all) => setInstallers(all.filter((i) => i.active)))
      .catch(() => toast.error('Could not load installers'));
    const preselected = params.get('customer');
    if (preselected) void selectCustomer(preselected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (debouncedSearch.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    listCustomers({ q: debouncedSearch, limit: 8 })
      .then((data) => !cancelled && setResults(data.customers))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const errors = {
    customer: !customer ? 'Select or add the customer' : '',
    category: !category ? 'Choose a category' : category === 'Other' && !categoryOther.trim() ? 'Describe the category' : '',
    description: description.trim().length < 5 ? 'Write what the customer reported' : '',
    installer: !installerId ? 'Select the installer' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) {
      setShowErrors(true);
      toast.error('Fill in the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      const complaint = await createComplaint({
        customerId: customer!.id,
        category,
        categoryOther: category === 'Other' ? categoryOther.trim() : undefined,
        description: description.trim(),
        priority,
        installerId,
      });
      toast.success(`${complaint.complaintNumber} created for ${complaint.assignedInstallerName}`);
      navigate(`/admin/complaints/${complaint.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  const err = (key: keyof typeof errors) => (showErrors ? errors[key] || undefined : undefined);
  const digits = /^\d+$/.test(search.trim());

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/admin/complaints"
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to complaints
      </Link>
      <h1 className="mb-5 mt-2 text-2xl font-extrabold tracking-tight">New complaint</h1>

      {/* ---- 1. Customer ---- */}
      <Card className={cn('mb-4', err('customer') && 'border-destructive')}>
        <CardContent className="p-5">
          <p className="mb-3 text-[0.8rem] font-bold uppercase tracking-wide text-foreground/80">
            Customer<span className="ml-0.5 text-primary">*</span>
          </p>

          {customer ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold leading-tight">{customer.name}</p>
                  <p className="font-mono-brand text-sm text-muted-foreground">{customer.mobile}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomer(null);
                    setOpenComplaints([]);
                  }}
                >
                  <X className="h-4 w-4" />
                  Change
                </Button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Customer ID" mono>
                  {customer.customerCode}
                </Field>
                <Field label="Project ID" mono>
                  {customer.projectId}
                </Field>
                <Field label="Village / City">{customer.cityVillage}</Field>
                <Field label="Address" className="col-span-2 sm:col-span-3">
                  {customer.address}
                </Field>
                <Field label="System size" mono>
                  {customer.systemSizeKw !== undefined ? `${customer.systemSizeKw} kW` : ''}
                </Field>
                <Field label="Installed on">{customer.installationDate ? formatDate(customer.installationDate) : ''}</Field>
                <Field label="Installed by (reference)">{customer.installedBy}</Field>
              </dl>

              {openComplaints.length > 0 && (
                <div role="alert" className="mt-4 rounded-xl border border-warning/60 bg-warning/15 p-3.5">
                  <p className="flex items-center gap-2 text-sm font-bold text-warning-foreground">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    This customer already has {openComplaints.length === 1 ? 'an open complaint' : `${openComplaints.length} open complaints`}.
                  </p>
                  <p className="mt-0.5 text-sm text-warning-foreground/90">
                    Check whether this call is about the same issue before creating another one.
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {openComplaints.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/admin/complaints/${c.id}`}
                          target="_blank"
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm hover:shadow-warm-sm"
                        >
                          <span className="font-mono-brand font-semibold">{c.complaintNumber}</span>
                          <span className="min-w-0 flex-1 truncate">{c.category}</span>
                          <span className="text-xs text-muted-foreground">{c.installerName}</span>
                          <StatusBadge status={c.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : adding ? (
            <CustomerForm
              prefill={digits ? { mobile: search.trim().slice(0, 10) } : { name: search.trim() }}
              submitLabel="Save customer"
              onCancel={() => setAdding(false)}
              onSubmit={async (payload) => {
                try {
                  const data = await createCustomer(payload);
                  if (data.duplicateMobile) toast.warning('Another customer already uses this mobile number');
                  await selectCustomer(data.customer.id);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            />
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search customer"
                  placeholder="Search by mobile, name, customer ID or project ID"
                  className="pl-11"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {results && (
                <ul className="mt-2 divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectCustomer(c.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            <span className="font-mono-brand">{c.mobile}</span>
                            {c.cityVillage ? ` - ${c.cityVillage}` : ''} - {c.customerCode}
                            {c.projectId ? ` - ${c.projectId}` : ''}
                          </span>
                        </span>
                        {Boolean(c.openComplaints) && (
                          <span className="flex-shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[0.7rem] font-bold text-warning-foreground">
                            {c.openComplaints} open
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {results.length === 0 && (
                    <li className="px-4 py-3 text-sm text-muted-foreground">No customer found for "{debouncedSearch}".</li>
                  )}
                </ul>
              )}

              <Button variant="soft" size="sm" className="mt-3" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" />
                Add new customer
              </Button>
              {err('customer') && <p className="mt-2 text-xs font-semibold text-destructive">{err('customer')}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- 2. Complaint ---- */}
      <form onSubmit={submit} noValidate>
        <Card>
          <CardContent className="grid gap-5 p-5">
            <FormField label="Complaint category" required error={err('category')}>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Complaint category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category === 'Other' && (
                <Input
                  aria-label="Describe the category"
                  placeholder="Describe the category"
                  className="mt-2"
                  value={categoryOther}
                  onChange={(e) => setCategoryOther(e.target.value)}
                  maxLength={120}
                />
              )}
            </FormField>

            <FormField label="Complaint description" htmlFor="description" required error={err('description')}>
              <Textarea
                id="description"
                ref={descriptionRef}
                className="min-h-[150px]"
                placeholder="What did the customer say? e.g. Solar generation has been very low for the last 3 days."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
              />
            </FormField>

            <FormField label="Priority" required>
              <div role="radiogroup" aria-label="Priority" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={priority === p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-colors',
                      priority === p
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-input bg-card text-foreground hover:border-foreground/40',
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', PRIORITY_DOT[p])} />
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField
              label="Assigned installer"
              required
              error={err('installer')}
              hint={
                autoInstaller
                  ? `Selected automatically: ${autoInstaller} installed this customer's system. Change it if someone else should handle this complaint.`
                  : customer && !installerId
                    ? customer.installedBy
                      ? `This customer's installer (${customer.installedBy}) is not in the installer list - choose who will handle this complaint.`
                      : 'No installer is recorded for this customer - choose who will handle this complaint.'
                    : "Choose who will handle this complaint. It goes only on that installer's Excel sheet."
              }
            >
              <Select
                value={installerId}
                onValueChange={(value) => {
                  setInstallerId(value);
                  setAutoInstaller('');
                }}
              >
                <SelectTrigger aria-label="Assigned installer" className={cn(err('installer') && 'border-destructive')}>
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

            <Button type="submit" size="xl" className="w-full uppercase tracking-wide" loading={submitting}>
              Create Complaint
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
