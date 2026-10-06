import * as React from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Customer, CustomerInput } from '@/types';

interface FormState {
  name: string;
  mobile: string;
  address: string;
  cityVillage: string;
  projectId: string;
  systemSizeKw: string;
  installationDate: string;
  installedBy: string;
  inverter: string;
  panels: string;
}

function initialState(customer?: Customer, prefill?: Partial<FormState>): FormState {
  return {
    name: customer?.name ?? '',
    mobile: customer?.mobile ?? '',
    address: customer?.address ?? '',
    cityVillage: customer?.cityVillage ?? '',
    projectId: customer?.projectId ?? '',
    systemSizeKw: customer?.systemSizeKw !== undefined ? String(customer.systemSizeKw) : '',
    installationDate: customer?.installationDate ? customer.installationDate.slice(0, 10) : '',
    installedBy: customer?.installedBy ?? '',
    inverter: customer?.inverter ?? '',
    panels: customer?.panels ?? '',
    ...prefill,
  };
}

/**
 * Add / edit a customer. Only name and mobile are required, so a customer
 * who is not in the system yet can be added in seconds during a phone call.
 */
export function CustomerForm({
  customer,
  prefill,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  customer?: Customer;
  prefill?: { name?: string; mobile?: string };
  submitLabel: string;
  onSubmit: (payload: CustomerInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = React.useState<FormState>(() => initialState(customer, prefill));
  const [busy, setBusy] = React.useState(false);
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    const editing = Boolean(customer);
    // When editing, a cleared field is sent as '' so the server removes it; when creating, blanks are just omitted.
    const text = (value: string) => (value.trim() ? value.trim() : editing ? '' : undefined);
    try {
      await onSubmit({
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        address: text(form.address),
        cityVillage: text(form.cityVillage),
        projectId: text(form.projectId),
        installedBy: text(form.installedBy),
        inverter: text(form.inverter),
        panels: text(form.panels),
        systemSizeKw: form.systemSizeKw ? Number(form.systemSizeKw) : undefined,
        installationDate: form.installationDate || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Customer name" htmlFor="cust-name" required>
        <Input id="cust-name" value={form.name} onChange={set('name')} minLength={2} maxLength={120} required autoFocus />
      </FormField>
      <FormField label="Mobile" htmlFor="cust-mobile" required>
        <Input
          id="cust-mobile"
          value={form.mobile}
          onChange={set('mobile')}
          inputMode="numeric"
          pattern="[0-9]{10}"
          title="10-digit mobile number"
          maxLength={10}
          className="font-mono-brand"
          required
        />
      </FormField>
      <FormField label="Address" htmlFor="cust-address" className="sm:col-span-2">
        <Input id="cust-address" value={form.address} onChange={set('address')} maxLength={300} />
      </FormField>
      <FormField label="Village / City" htmlFor="cust-city">
        <Input id="cust-city" value={form.cityVillage} onChange={set('cityVillage')} maxLength={80} />
      </FormField>
      <FormField label="Project ID" htmlFor="cust-project">
        <Input id="cust-project" value={form.projectId} onChange={set('projectId')} maxLength={40} className="font-mono-brand" />
      </FormField>
      <FormField label="System size (kW)" htmlFor="cust-size">
        <Input
          id="cust-size"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={form.systemSizeKw}
          onChange={set('systemSizeKw')}
        />
      </FormField>
      <FormField label="Installation date" htmlFor="cust-date">
        <Input id="cust-date" type="date" value={form.installationDate} onChange={set('installationDate')} />
      </FormField>
      <FormField label="Installed by" htmlFor="cust-installer" hint="For reference only">
        <Input id="cust-installer" value={form.installedBy} onChange={set('installedBy')} maxLength={120} />
      </FormField>
      <FormField label="Inverter" htmlFor="cust-inverter">
        <Input id="cust-inverter" value={form.inverter} onChange={set('inverter')} maxLength={120} />
      </FormField>
      <FormField label="Panels" htmlFor="cust-panels" className="sm:col-span-2">
        <Input id="cust-panels" value={form.panels} onChange={set('panels')} maxLength={120} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
