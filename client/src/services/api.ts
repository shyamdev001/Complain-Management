import { api } from '@/lib/axios';
import { compressImage } from '@/lib/complaints';
import type {
  AppNotification,
  AppUser,
  AuditLogEntry,
  Complaint,
  ComplaintListItem,
  ComplaintStats,
  Customer,
  CustomerInput,
  Installer,
  Pagination,
  Part,
  PhotoKind,
  SlaConfig,
} from '@/types';

type Params = Record<string, string | number | boolean | undefined>;

/** Drops empty values so they are not sent as blank query params. */
function clean(params: Params): Params {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false));
}

/* ---- Complaints ---- */

export async function listComplaints(params: Params = {}) {
  const { data } = await api.get('/complaints', { params: clean(params) });
  return data as { complaints: ComplaintListItem[]; pagination: Pagination };
}

export async function getComplaintStats(): Promise<ComplaintStats> {
  return (await api.get('/complaints/stats')).data;
}

export async function getComplaint(id: string): Promise<Complaint> {
  return (await api.get(`/complaints/${id}`)).data.complaint;
}

export async function createComplaint(payload: {
  customerId: string;
  category: string;
  categoryOther?: string;
  description: string;
  priority: string;
  installerId: string;
}): Promise<Complaint> {
  return (await api.post('/complaints', payload)).data.complaint;
}

/** Every complaint action returns the updated complaint, so pages can swap it in without refetching. */
async function action(id: string, path: string, body: object = {}, method: 'post' | 'put' | 'patch' = 'post') {
  const url = path ? `/complaints/${id}/${path}` : `/complaints/${id}`;
  return (await api[method](url, body)).data.complaint as Complaint;
}

export interface ServiceReport {
  diagnosis?: string;
  actionTaken?: string;
  partsUsed?: Part[];
  serviceNotes?: string;
}

export const complaintActions = {
  update: (id: string, body: object) => action(id, '', body, 'patch'),
  reassign: (id: string, installerId: string, reason?: string) => action(id, 'reassign', { installerId, reason }),
  accept: (id: string) => action(id, 'accept'),
  schedule: (id: string, body: { at: string; technician?: string; note?: string }) => action(id, 'schedule', body),
  setStatus: (id: string, status: string, note?: string) => action(id, 'status', { status, note }),
  saveReport: (id: string, report: ServiceReport) => action(id, 'service-report', report, 'put'),
  resolve: (id: string, report: ServiceReport) => action(id, 'resolve', report),
  addNote: (id: string, text: string, internal?: boolean) => action(id, 'notes', { text, internal }),
  confirm: (id: string, status: 'CONFIRMED' | 'NOT_RESOLVED', note?: string) =>
    action(id, 'customer-confirmation', { status, note }),
  close: (id: string, note?: string) => action(id, 'close', { note }),
  reopen: (id: string, reason: string) => action(id, 'reopen', { reason }),
  archive: (id: string, reason: string) => action(id, 'archive', { reason }),
  restore: (id: string) => action(id, 'restore'),
};

/** Permanent - super admin only. */
export async function deleteComplaint(id: string): Promise<void> {
  await api.delete(`/complaints/${id}`);
}

export async function uploadPhotos(id: string, kind: PhotoKind, files: File[]): Promise<Complaint> {
  const form = new FormData();
  form.append('kind', kind);
  for (const file of files) {
    form.append('photos', await compressImage(file), file.name.replace(/\.[^.]+$/, '') + '.jpg');
  }
  return (await api.post(`/complaints/${id}/photos`, form)).data.complaint;
}

/** Photos are private: fetched with the session cookie and shown from a local object URL. */
export async function fetchPhotoBlob(complaintId: string, photoId: string): Promise<Blob> {
  return (await api.get(`/complaints/${complaintId}/photos/${photoId}`, { responseType: 'blob' })).data;
}

/**
 * Downloads the Excel sheet of one installer's complaints and saves it through
 * the browser. Resolves with the file name; rejects with the server's message
 * (for example when there are no complaints in the period).
 */
export async function downloadInstallerSheet(params: {
  installer: string;
  from: string;
  to: string;
  pending: boolean;
}): Promise<string> {
  let response;
  try {
    response = await api.get('/complaints/export', { params: clean(params), responseType: 'blob' });
  } catch (err) {
    // With responseType "blob" an error body arrives as a blob too - unwrap it so the message can be shown.
    const blob = (err as { response?: { data?: Blob } }).response?.data;
    if (blob instanceof Blob) {
      const message = await blob
        .text()
        .then((text) => JSON.parse(text).message as string)
        .catch(() => undefined);
      if (message) throw new Error(message);
    }
    throw new Error('Could not download the sheet. Please try again.');
  }
  const filename =
    /filename="([^"]+)"/.exec(response.headers['content-disposition'] ?? '')?.[1] ?? 'Complaints.xlsx';
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export type ImportOutcome = 'RESOLVED' | 'UPDATED' | 'NO_CHANGE' | 'SKIPPED';

export interface ImportResult {
  applied: boolean;
  installerName?: string;
  rows: {
    row: number;
    complaintNumber: string;
    customerName?: string;
    outcome: ImportOutcome;
    changes: string[];
    warnings: string[];
    reason?: string;
  }[];
  summary: Record<ImportOutcome, number>;
}

/** Uploads the sheet an installer filled in. With apply=false the server only reports what would change. */
export async function importInstallerSheet(file: File, apply: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  return (await api.post('/complaints/import', form, { params: apply ? { apply: 'true' } : undefined })).data;
}

/* ---- Customers ---- */

export async function listCustomers(params: Params = {}) {
  const { data } = await api.get('/customers', { params: clean(params) });
  return data as { customers: Customer[]; pagination: Pagination };
}

export async function getCustomer(id: string) {
  const { data } = await api.get(`/customers/${id}`);
  return data as { customer: Customer; serviceHistory: ComplaintListItem[]; openComplaints: ComplaintListItem[] };
}

export async function createCustomer(payload: CustomerInput) {
  const { data } = await api.post('/customers', payload);
  return data as { customer: Customer; duplicateMobile: boolean };
}

/** Permanent - super admin only. Refused while the customer still has complaints. */
export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

export async function updateCustomer(id: string, payload: CustomerInput): Promise<Customer> {
  return (await api.patch(`/customers/${id}`, payload)).data.customer;
}

/* ---- Installers, users, settings, audit ---- */

export async function listInstallers(): Promise<Installer[]> {
  return (await api.get('/installers')).data.installers;
}
export async function createInstaller(payload: { name: string; phone?: string }): Promise<Installer> {
  return (await api.post('/installers', payload)).data.installer;
}
export async function updateInstaller(id: string, payload: Partial<Installer>): Promise<Installer> {
  return (await api.patch(`/installers/${id}`, payload)).data.installer;
}

export async function listUsers(): Promise<AppUser[]> {
  return (await api.get('/users')).data.users;
}
export async function createUser(payload: {
  name: string;
  email: string;
  phone?: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  password: string;
}): Promise<AppUser> {
  return (await api.post('/users', payload)).data.user;
}
export async function setUserRole(id: string, role: 'ADMIN' | 'SUPER_ADMIN'): Promise<void> {
  await api.patch(`/users/${id}/role`, { role });
}
export async function setUserStatus(id: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> {
  await api.patch(`/users/${id}/status`, { status });
}
export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  await api.post(`/users/${id}/reset-credentials`, { newPassword });
}

export async function getSla(): Promise<SlaConfig> {
  return (await api.get('/settings/sla')).data.sla;
}
export async function saveSla(sla: SlaConfig): Promise<SlaConfig> {
  return (await api.put('/settings/sla', { sla })).data.sla;
}

export async function listAuditLogs(page: number) {
  const { data } = await api.get('/audit-logs', { params: { page } });
  return data as { logs: AuditLogEntry[]; pagination: Pagination };
}

/* ---- Notifications ---- */

export async function listNotifications() {
  const { data } = await api.get('/notifications');
  return data as { unread: number; notifications: AppNotification[] };
}
export async function markNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}
