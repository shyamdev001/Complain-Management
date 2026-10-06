import { z } from 'zod';
import { ComplaintCategory, ComplaintStatus, PhotoKind, Priority } from '../types/enums';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const categories = Object.values(ComplaintCategory) as [ComplaintCategory, ...ComplaintCategory[]];
const priorities = Object.values(Priority) as [Priority, ...Priority[]];
const statuses = Object.values(ComplaintStatus) as [ComplaintStatus, ...ComplaintStatus[]];

const optionalText = (max: number) => z.string().trim().max(max).optional();

const partSchema = z.object({
  name: z.string().trim().min(1, 'Part name is required').max(120),
  quantity: z.coerce.number().min(0).max(100000).default(1),
});

export const idParamSchema = z.object({ id: objectId });
export const photoParamSchema = z.object({ id: objectId, photoId: objectId });

export const createComplaintSchema = z.object({
  customerId: objectId,
  category: z.enum(categories),
  categoryOther: optionalText(120),
  description: z.string().trim().min(5, 'Describe the complaint').max(4000),
  priority: z.enum(priorities).default(Priority.NORMAL),
  // No default and no inference: the office must pick the installer explicitly.
  installerId: objectId,
});

export const updateComplaintSchema = z.object({
  category: z.enum(categories).optional(),
  categoryOther: optionalText(120),
  description: z.string().trim().min(5).max(4000).optional(),
  priority: z.enum(priorities).optional(),
});

export const reassignSchema = z.object({
  installerId: objectId,
  reason: optionalText(300),
});

export const scheduleVisitSchema = z.object({
  at: z.coerce.date(),
  technician: optionalText(120),
  note: optionalText(500),
});

export const updateStatusSchema = z.object({
  status: z.enum([ComplaintStatus.IN_PROGRESS, ComplaintStatus.WAITING_FOR_PARTS]),
  note: optionalText(500),
});

export const serviceReportSchema = z.object({
  diagnosis: optionalText(2000),
  actionTaken: optionalText(2000),
  partsUsed: z.array(partSchema).max(50).optional(),
  serviceNotes: optionalText(2000),
});

export const photoUploadSchema = z.object({
  kind: z.enum([PhotoKind.BEFORE, PhotoKind.AFTER]),
});

export const noteSchema = z.object({
  text: z.string().trim().min(1, 'Note is empty').max(2000),
  internal: z.boolean().optional(),
});

export const confirmationSchema = z.object({
  status: z.enum(['CONFIRMED', 'NOT_RESOLVED']),
  note: optionalText(500),
});

export const closeSchema = z.object({ note: optionalText(500) });
export const reopenSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening').max(500) });
export const archiveSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const listComplaintsSchema = z.object({
  q: optionalText(100),
  installer: objectId.optional(),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  category: z.enum(categories).optional(),
  city: optionalText(80),
  customer: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  overdue: z.enum(['true', 'false']).optional(),
  open: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
export const exportSchema = z.object({
  installer: objectId,
  from: day,
  to: day,
  pending: z.enum(['true', 'false']).optional(),
});

export const importSchema = z.object({ apply: z.enum(['true', 'false']).optional() });

export const webhookConfirmationSchema = z.object({
  complaintNumber: z.string().trim().min(1).max(40),
  response: z.enum(['RESOLVED', 'NOT_RESOLVED']),
  note: optionalText(500),
});
