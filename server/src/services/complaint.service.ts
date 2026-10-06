import { Request } from 'express';
import { FilterQuery, isValidObjectId } from 'mongoose';
import { Complaint, IComplaint, IPhoto, ITimelineEntry } from '../models/Complaint';
import {
  ComplaintStatus,
  ConfirmationStatus,
  NotificationType,
  TimelineEvent,
  UserRole,
} from '../types/enums';
import { ApiError } from '../utils/ApiError';
import { computeDeadlines, isOverdue } from './sla.service';
import { notify } from './notification.service';

export interface Actor {
  id?: string;
  name: string;
  role: string;
}

export const SYSTEM_ACTOR: Actor = { name: 'System', role: 'SYSTEM' };

export function actorOf(req: Request): Actor & { id: string } {
  return { id: req.user!.id, name: req.user!.name, role: req.user!.role };
}

/** How an actor is named in the timeline: installers act on behalf of their company. */
export function actorLabel(req: Request): string {
  const { role, name, installerName } = req.user!;
  if (role !== UserRole.INSTALLER || !installerName || installerName === name) return name;
  return `${installerName} (${name})`;
}

/**
 * Appends to the complaint's activity history. The timeline is append-only:
 * no route edits or removes an entry.
 */
export function addTimeline(
  complaint: IComplaint,
  type: TimelineEvent,
  message: string,
  actor: Actor,
  visibility: 'ALL' | 'ADMIN' = 'ALL',
): void {
  const entry: ITimelineEntry = {
    type,
    message,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    visibility,
    at: new Date(),
  };
  complaint.timeline.push(entry);
}

/**
 * Installer isolation, enforced in the query itself: an installer's filter is
 * always pinned to their own company, whatever else the request asked for.
 */
export function scopeFilter(req: Request): FilterQuery<IComplaint> {
  if (req.user!.role === UserRole.ADMIN) return {};
  return { assignedInstaller: req.user!.installerId, archived: false };
}

/**
 * Loads one complaint and rejects it unless the requester is an admin or
 * belongs to the installer it is assigned to.
 */
export async function loadComplaintFor(req: Request, id: string): Promise<IComplaint> {
  if (!isValidObjectId(id)) throw ApiError.notFound('Complaint not found');
  const complaint = await Complaint.findById(id);
  if (!complaint) throw ApiError.notFound('Complaint not found');

  if (req.user!.role !== UserRole.ADMIN) {
    const ownsIt = req.user!.installerId && String(complaint.assignedInstaller) === req.user!.installerId;
    if (!ownsIt || complaint.archived) {
      throw ApiError.forbidden('This complaint is not assigned to your company');
    }
  }
  return complaint;
}

export function assertStatus(complaint: IComplaint, allowed: ComplaintStatus[], action: string): void {
  if (!allowed.includes(complaint.status)) {
    throw ApiError.conflict(`Cannot ${action} while the complaint is ${complaint.status.replace(/_/g, ' ')}`);
  }
}

function hoursBetween(from?: Date, to?: Date): number | null {
  if (!from || !to) return null;
  return Math.round(((to.getTime() - from.getTime()) / 3600000) * 10) / 10;
}

/** Full detail view. Storage keys are never exposed, and installers never receive admin-only timeline entries. */
export function serializeComplaint(complaint: IComplaint, role: UserRole) {
  const c = complaint.toObject();
  const lastResolution = c.resolutions[c.resolutions.length - 1];
  return {
    ...c,
    id: String(c._id),
    photos: c.photos.map((p: IPhoto) => ({
      id: String(p._id),
      kind: p.kind,
      size: p.size,
      uploadedByName: p.uploadedByName,
      uploadedAt: p.uploadedAt,
    })),
    timeline: c.timeline.filter((t: ITimelineEntry) => role === UserRole.ADMIN || t.visibility !== 'ADMIN'),
    isOverdue: isOverdue(c),
    resolutionTimeHours: hoursBetween(c.createdAt, lastResolution?.resolvedAt),
  };
}

export const LIST_PROJECTION =
  'complaintNumber customer customerSnapshot category categoryOther description priority status assignedInstaller assignedInstallerName createdAt dueDate responseDueAt scheduledVisit resolvedAt closedAt archived reopenedCount';

export function serializeListItem(c: any) {
  return {
    id: String(c._id),
    complaintNumber: c.complaintNumber,
    customerId: String(c.customer),
    customerName: c.customerSnapshot.name,
    customerMobile: c.customerSnapshot.mobile,
    customerCode: c.customerSnapshot.customerCode,
    projectId: c.customerSnapshot.projectId,
    location: [c.customerSnapshot.address, c.customerSnapshot.cityVillage].filter(Boolean).join(', '),
    cityVillage: c.customerSnapshot.cityVillage,
    category: c.category === 'Other' && c.categoryOther ? `Other: ${c.categoryOther}` : c.category,
    description: c.description,
    priority: c.priority,
    status: c.status,
    installerId: String(c.assignedInstaller),
    installerName: c.assignedInstallerName,
    createdAt: c.createdAt,
    dueDate: c.dueDate,
    scheduledVisitAt: c.scheduledVisit?.at,
    resolvedAt: c.resolvedAt,
    closedAt: c.closedAt,
    archived: c.archived,
    reopenedCount: c.reopenedCount,
    isOverdue: isOverdue(c),
  };
}

/**
 * Puts a resolved/closed complaint back to work. The earlier resolution stays
 * in `resolutions[]` and the timeline; only the live status and deadlines reset.
 */
export async function reopenComplaint(complaint: IComplaint, reason: string, actor: Actor): Promise<void> {
  const now = new Date();
  const deadlines = await computeDeadlines(complaint.priority, now);
  complaint.status = ComplaintStatus.REOPENED;
  complaint.reopenedCount += 1;
  complaint.resolvedAt = undefined;
  complaint.closedAt = undefined;
  complaint.closedBy = undefined;
  complaint.closedByName = undefined;
  complaint.responseDueAt = deadlines.responseDueAt;
  complaint.dueDate = deadlines.dueDate;
  complaint.overdueNotifiedAt = undefined;
  addTimeline(complaint, TimelineEvent.REOPENED, `Complaint reopened by ${actor.name}: ${reason}`, actor);
  await complaint.save();

  await notify({
    type: NotificationType.COMPLAINT_REOPENED,
    complaint,
    message: `${complaint.complaintNumber} was reopened: ${reason}`,
    audiences: ['ADMIN', { installerId: complaint.assignedInstaller }],
  });
}

/**
 * Records the customer's answer to "is the issue resolved?". Shared by the
 * office (recorded by hand after a phone call) and the WhatsApp/n8n webhook.
 * "Still exists" reopens the complaint; "resolved" leaves it ready for the
 * office to close.
 */
export async function applyCustomerConfirmation(
  complaint: IComplaint,
  status: typeof ConfirmationStatus.CONFIRMED | typeof ConfirmationStatus.NOT_RESOLVED,
  source: 'OFFICE' | 'WHATSAPP',
  actor: Actor,
  note?: string,
): Promise<void> {
  assertStatus(complaint, [ComplaintStatus.RESOLVED_BY_INSTALLER], 'record customer confirmation');

  complaint.customerConfirmation = {
    status,
    source,
    note,
    recordedByName: actor.name,
    requestedAt: complaint.customerConfirmation?.requestedAt,
    recordedAt: new Date(),
  };
  const via = source === 'WHATSAPP' ? 'on WhatsApp' : `(recorded by ${actor.name})`;

  if (status === ConfirmationStatus.CONFIRMED) {
    addTimeline(
      complaint,
      TimelineEvent.CUSTOMER_CONFIRMED,
      `Customer confirmed the issue is resolved ${via}${note ? `: ${note}` : ''}`,
      actor,
    );
    await complaint.save();
    await notify({
      type: NotificationType.CUSTOMER_CONFIRMATION,
      complaint,
      message: `Customer confirmed ${complaint.complaintNumber} is resolved - ready to close`,
      audiences: ['ADMIN'],
    });
    return;
  }

  addTimeline(
    complaint,
    TimelineEvent.CUSTOMER_NOT_RESOLVED,
    `Customer says the issue still exists ${via}${note ? `: ${note}` : ''}`,
    actor,
  );
  await reopenComplaint(complaint, 'Customer reported the issue still exists', actor);
}
