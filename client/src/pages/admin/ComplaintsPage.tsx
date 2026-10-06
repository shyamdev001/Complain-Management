import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, Pager } from '@/components/PageHeader';
import { OverdueBadge, PriorityBadge, StatusBadge } from '@/components/complaints/Badges';
import { ExportSheetButton } from '@/components/complaints/ExportSheetDialog';
import { ImportSheetButton } from '@/components/complaints/ImportSheetDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { listComplaints, listInstallers } from '@/services/api';
import { CATEGORIES, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '@/lib/complaints';
import { cn, formatDate } from '@/lib/utils';
import type { ComplaintListItem, Installer, Pagination } from '@/types';

const ALL = 'ALL';
const FILTER_KEYS = ['q', 'installer', 'status', 'priority', 'category', 'city', 'from', 'to', 'overdue', 'open', 'archived', 'customer'];

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger aria-label={label} className="h-10 text-sm md:text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-10 rounded-xl border px-3.5 text-sm font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

/** Filters live in the URL, so a filtered view can be linked to (from the dashboard) and survives a refresh. */
export function ComplaintsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [installers, setInstallers] = React.useState<Installer[]>([]);
  const [rows, setRows] = React.useState<ComplaintListItem[] | null>(null);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [search, setSearch] = React.useState(params.get('q') ?? '');
  const [city, setCity] = React.useState(params.get('city') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCity = useDebounce(city, 300);

  const get = (key: string) => params.get(key) ?? '';
  const set = React.useCallback(
    (patch: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  React.useEffect(() => {
    listInstallers().then(setInstallers).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (debouncedSearch !== (params.get('q') ?? '')) set({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  React.useEffect(() => {
    if (debouncedCity !== (params.get('city') ?? '')) set({ city: debouncedCity });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCity]);

  const query = params.toString();
  React.useEffect(() => {
    let cancelled = false;
    listComplaints(Object.fromEntries(new URLSearchParams(query)))
      .then((data) => {
        if (cancelled) return;
        setRows(data.complaints);
        setPagination(data.pagination);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const hasFilters = FILTER_KEYS.some((key) => params.has(key));
  const clear = () => {
    setSearch('');
    setCity('');
    setParams({}, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Complaints"
        description="Search by complaint number, customer name, mobile, customer ID, project ID or installer."
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

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search complaints"
            placeholder="Search complaints..."
            className="h-10 pl-10 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect
          label="Installer"
          value={get('installer')}
          onChange={(v) => set({ installer: v })}
          options={installers.map((i) => ({ value: i.id, label: i.name }))}
        />
        <FilterSelect
          label="Status"
          value={get('status')}
          onChange={(v) => set({ status: v })}
          options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <FilterSelect
          label="Priority"
          value={get('priority')}
          onChange={(v) => set({ priority: v })}
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
        <FilterSelect
          label="Category"
          value={get('category')}
          onChange={(v) => set({ category: v })}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <Input
          aria-label="Village or city"
          placeholder="Village / city"
          className="h-10 text-sm"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            aria-label="Created from"
            type="date"
            className="h-10 px-2.5 text-sm"
            value={get('from')}
            onChange={(e) => set({ from: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            aria-label="Created to"
            type="date"
            className="h-10 px-2.5 text-sm"
            value={get('to')}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Toggle label="Overdue only" active={get('overdue') === 'true'} onClick={() => set({ overdue: get('overdue') ? '' : 'true' })} />
          <Toggle label="Open only" active={get('open') === 'true'} onClick={() => set({ open: get('open') ? '' : 'true' })} />
          <Toggle label="Archived" active={get('archived') === 'true'} onClick={() => set({ archived: get('archived') ? '' : 'true' })} />
          {get('customer') && <Toggle label="One customer" active onClick={() => set({ customer: '' })} />}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {!rows ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title={hasFilters ? 'No complaints match these filters' : 'No complaints yet'}
          description={hasFilters ? 'Try removing a filter or searching for something else.' : 'Create the first complaint when a customer calls.'}
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Complaint</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Installer</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow
                key={c.id}
                tabIndex={0}
                onClick={() => navigate(`/admin/complaints/${c.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/complaints/${c.id}`)}
                className={cn('cursor-pointer', c.isOverdue && 'bg-destructive/[0.04]')}
              >
                <TableCell className="font-mono-brand text-[0.8rem] font-semibold">{c.complaintNumber}</TableCell>
                <TableCell>
                  <p className="font-semibold">{c.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono-brand">{c.customerMobile}</span>
                    {c.cityVillage ? ` - ${c.cityVillage}` : ''}
                  </p>
                </TableCell>
                <TableCell className="max-w-[16rem] whitespace-normal">
                  <p className="font-medium">{c.category}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{c.description}</p>
                </TableCell>
                <TableCell className="font-medium">{c.installerName}</TableCell>
                <TableCell>
                  <PriorityBadge priority={c.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                <TableCell>
                  {c.isOverdue ? (
                    <OverdueBadge />
                  ) : (
                    <span className="text-muted-foreground">{c.dueDate ? formatDate(c.dueDate, true) : '-'}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pagination && rows && rows.length > 0 && <Pager pagination={pagination} onPage={(page) => set({ page: String(page) })} />}
    </div>
  );
}
