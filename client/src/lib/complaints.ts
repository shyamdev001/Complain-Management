import type { BadgeProps } from '@/components/ui/badge';
import type { ComplaintStatus, Priority } from '@/types';

export const CATEGORIES = [
  'Solar generation issue',
  'Inverter issue',
  'Panel issue',
  'Wiring issue',
  'Earthing issue',
  'Monitoring/app issue',
  'Physical damage',
  'Water leakage',
  'Electrical issue',
  'Electricity/billing issue',
  'Portal/subsidy issue',
  'Installation quality issue',
  'Other',
] as const;

export const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

export const STATUSES: ComplaintStatus[] = [
  'NEW',
  'ACCEPTED',
  'VISIT_SCHEDULED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'RESOLVED_BY_INSTALLER',
  'CLOSED',
  'REOPENED',
];

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  VISIT_SCHEDULED: 'Visit Scheduled',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_PARTS: 'Waiting for Parts',
  RESOLVED_BY_INSTALLER: 'Resolved by Installer',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

type Variant = NonNullable<BadgeProps['variant']>;

/** Single source of truth for status color - never redefine these locally. */
export const STATUS_VARIANT: Record<ComplaintStatus, Variant> = {
  NEW: 'info',
  ACCEPTED: 'premium',
  VISIT_SCHEDULED: 'info',
  IN_PROGRESS: 'default',
  WAITING_FOR_PARTS: 'warning',
  RESOLVED_BY_INSTALLER: 'success',
  CLOSED: 'secondary',
  REOPENED: 'destructive',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

/** Critical = red, High = orange, Normal = yellow, Low = green - mapped onto the design system's semantic tokens. */
export const PRIORITY_VARIANT: Record<Priority, Variant> = {
  CRITICAL: 'destructive',
  HIGH: 'default',
  NORMAL: 'warning',
  LOW: 'success',
};

export const PRIORITY_DOT: Record<Priority, string> = {
  CRITICAL: 'bg-destructive',
  HIGH: 'bg-primary',
  NORMAL: 'bg-warning',
  LOW: 'bg-success',
};

export const WORKING_STATUSES: ComplaintStatus[] = [
  'ACCEPTED',
  'VISIT_SCHEDULED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'REOPENED',
];

export function mapsUrl(...parts: Array<string | undefined>): string {
  const query = parts.filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '-';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} hrs`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

/** Value for <input type="datetime-local"> in the device's own timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MAX_UPLOAD_DIMENSION = 1600;

/**
 * Shrinks a phone-camera photo in the browser before upload, so a 6-10MB
 * original goes over a weak mobile connection as a few hundred KB. The server
 * optimizes again; if anything here fails the original file is sent as-is.
 */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
