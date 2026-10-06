import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Contact, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CustomerForm } from '@/components/CustomerForm';
import { PageHeader, Pager } from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { createCustomer, listCustomers } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import type { Customer, Pagination } from '@/types';

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const q = useDebounce(search.trim(), 300);
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<Customer[] | null>(null);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => setPage(1), [q]);

  React.useEffect(() => {
    let cancelled = false;
    listCustomers({ q, page })
      .then((data) => {
        if (cancelled) return;
        setRows(data.customers);
        setPagination(data.pagination);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Customers"
        description="Open a customer to see their system details and full service history."
        action={
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" />
            Add customer
          </Button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search customers"
          placeholder="Search by name, mobile, customer ID, project ID or village"
          className="h-10 pl-10 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!rows ? (
        <Skeleton className="h-72" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Contact className="h-6 w-6" />}
          title={q ? 'No customers match your search' : 'No customers yet'}
          description={q ? undefined : 'Add customers here, or add them while creating a complaint.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Customer ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Village / City</TableHead>
              <TableHead>Project ID</TableHead>
              <TableHead>System</TableHead>
              <TableHead>Open complaints</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow
                key={c.id}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => navigate(`/admin/customers/${c.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/customers/${c.id}`)}
              >
                <TableCell className="font-mono-brand text-[0.8rem] font-semibold">{c.customerCode}</TableCell>
                <TableCell className="font-semibold">{c.name}</TableCell>
                <TableCell className="font-mono-brand text-[0.85rem]">{c.mobile}</TableCell>
                <TableCell>{c.cityVillage || '-'}</TableCell>
                <TableCell className="font-mono-brand text-[0.8rem]">{c.projectId || '-'}</TableCell>
                <TableCell>{c.systemSizeKw !== undefined ? `${c.systemSizeKw} kW` : '-'}</TableCell>
                <TableCell>
                  {c.openComplaints ? (
                    <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-bold text-warning-foreground">
                      {c.openComplaints} open
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pagination && rows && rows.length > 0 && <Pager pagination={pagination} onPage={setPage} />}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>Only name and mobile are required. The rest can be filled in later.</DialogDescription>
          </DialogHeader>
          <CustomerForm
            submitLabel="Save customer"
            onCancel={() => setAdding(false)}
            onSubmit={async (payload) => {
              try {
                const data = await createCustomer(payload);
                if (data.duplicateMobile) toast.warning('Another customer already uses this mobile number');
                toast.success(`${data.customer.customerCode} added`);
                navigate(`/admin/customers/${data.customer.id}`);
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
