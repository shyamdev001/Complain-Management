import { Request, Response } from 'express';
import { FilterQuery, Types } from 'mongoose';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { Complaint, IComplaint } from '../models/Complaint';
import { Customer } from '../models/Customer';
import { Installer } from '../models/Installer';
import {
  AuditAction,
  ComplaintCategory,
  ComplaintStatus,
  ConfirmationStatus,
  NotificationType,
  OPEN_STATUSES,
  TimelineEvent,
  UserRole,
} from '../types/enums';
import { recordAudit } from '../services/audit.service';
import { notify } from '../services/notification.service';
import { computeDeadlines, overdueFilter } from '../services/sla.service';
import { readPhoto, savePhoto } from '../services/storage.service';
import { buildInstallerSheet } from '../services/export.service';
import { importInstallerSheet } from '../services/import.service';
import {
  LIST_PROJECTION,
  actorLabel,
  actorOf,
  addTimeline,
  applyCustomerConfirmation,
  assertStatus,
  loadComplaintFor,
  reopenComplaint,
  scopeFilter,
  serializeComplaint,
  serializeListItem,
} from '../services/complaint.service';
import { escapeRegex, generateComplaintNumber } from '../utils/ids';

const S = ComplaintStatus;
/** Statuses in which the installer is actively working the complaint (already accepted, not yet resolved). */
const WORKING_STATUSES: ComplaintStatus[] = [
  S.ACCEPTED,
  S.VISIT_SCHEDULED,
  S.IN_PROGRESS,
  S.WAITING_FOR_PARTS,
  S.REOPENED,
];

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  VISIT_SCHEDULED: 'Visit Scheduled',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_PARTS: 'Waiting for Parts',
  RESOLVED_BY_INSTALLER: 'Resolved by Installer',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

function audit(req: Request, action: AuditAction, complaint: IComplaint, details?: string) {
  return recordAudit({
    action,
    actor: actorOf(req),
    targetType: 'Complaint',
    targetId: complaint._id.toString(),
    targetLabel: complaint.complaintNumber,
    details,
    req,
  });
}

function respond(req: Request, res: Response, complaint: IComplaint, status = 200) {
  res.status(status).json({ complaint: serializeComplaint(complaint, req.user!.role) });
}

function formatWhen(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/* ------------------------------------------------------------------ */
/* Listing, stats, detail                                              */
/* ------------------------------------------------------------------ */

export const listComplaints = catchAsync(async (req: Request, res: Response) => {
  const q = req.query as any;
  const isAdmin = req.user!.role === UserRole.ADMIN;
  const and: FilterQuery<IComplaint>[] = [];

  if (isAdmin) {
    and.push({ archived: q.archived === 'true' });
    if (q.installer) and.push({ assignedInstaller: q.installer });
  }
  if (q.status) and.push({ status: q.status });
  if (q.priority) and.push({ priority: q.priority });
  if (q.category) and.push({ category: q.category });
  if (q.customer) and.push({ customer: q.customer });
  if (q.city) and.push({ 'customerSnapshot.cityVillage': new RegExp(escapeRegex(q.city), 'i') });
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) range.$lte = new Date(new Date(q.to).setHours(23, 59, 59, 999));
    and.push({ createdAt: range });
  }
  if (q.open === 'true') and.push({ status: { $in: OPEN_STATUSES } });
  if (q.overdue === 'true') and.push(overdueFilter());
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    and.push({
      $or: [
        { complaintNumber: rx },
        { 'customerSnapshot.name': rx },
        { 'customerSnapshot.mobile': rx },
        { 'customerSnapshot.customerCode': rx },
        { 'customerSnapshot.projectId': rx },
        ...(isAdmin ? [{ assignedInstallerName: rx }] : []),
      ],
    });
  }

  // scopeFilter goes last so nothing a client sends can widen an installer's view.
  and.push(scopeFilter(req));
  const filter: FilterQuery<IComplaint> = { $and: and };

  const [total, items] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.find(filter)
      .select(LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
  ]);

  res.json({
    complaints: items.map(serializeListItem),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

export const getStats = catchAsync(async (req: Request, res: Response) => {
  const isAdmin = req.user!.role === UserRole.ADMIN;
  const base: FilterQuery<IComplaint> = { archived: false, ...scopeFilter(req) };

  const [byStatusRows, overdue] = await Promise.all([
    Complaint.aggregate([
      { $match: isAdmin ? { archived: false } : { archived: false, assignedInstaller: new Types.ObjectId(req.user!.installerId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Complaint.countDocuments({ $and: [base, overdueFilter()] }),
  ]);

  const byStatus = Object.fromEntries(Object.values(S).map((s) => [s, 0])) as Record<ComplaintStatus, number>;
  for (const row of byStatusRows) byStatus[row._id as ComplaintStatus] = row.count;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const open = OPEN_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  const result: Record<string, unknown> = { total, open, overdue, byStatus };

  if (isAdmin) {
    const [installers, perInstaller, overdueRows] = await Promise.all([
      Installer.find().sort({ name: 1 }).lean(),
      Complaint.aggregate([
        { $match: { archived: false } },
        {
          $group: {
            _id: '$assignedInstaller',
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', S.RESOLVED_BY_INSTALLER] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', S.CLOSED] }, 1, 0] } },
            reopened: { $sum: '$reopenedCount' },
            avgResolutionMs: {
              $avg: { $cond: [{ $ifNull: ['$resolvedAt', false] }, { $subtract: ['$resolvedAt', '$createdAt'] }, null] },
            },
          },
        },
      ]),
      Complaint.aggregate([{ $match: overdueFilter() }, { $group: { _id: '$assignedInstaller', count: { $sum: 1 } } }]),
    ]);
    const statMap = new Map(perInstaller.map((r) => [String(r._id), r]));
    const overdueMap = new Map(overdueRows.map((r) => [String(r._id), r.count]));
    result.installers = installers.map((i) => {
      const row = statMap.get(String(i._id));
      return {
        id: String(i._id),
        name: i.name,
        active: i.active,
        total: row?.total ?? 0,
        open: row?.open ?? 0,
        resolved: row?.resolved ?? 0,
        closed: row?.closed ?? 0,
        reopened: row?.reopened ?? 0,
        overdue: overdueMap.get(String(i._id)) ?? 0,
        avgResolutionHours: row?.avgResolutionMs ? Math.round((row.avgResolutionMs / 3600000) * 10) / 10 : null,
      };
    });
  }

  res.json(result);
});

export const getComplaint = catchAsync(async (req: Request, res: Response) => {
  respond(req, res, await loadComplaintFor(req, req.params.id));
});

/* ------------------------------------------------------------------ */
/* Office / admin actions                                              */
/* ------------------------------------------------------------------ */

export const createComplaint = catchAsync(async (req: Request, res: Response) => {
  const { customerId, category, categoryOther, description, priority, installerId } = req.body;

  if (category === ComplaintCategory.OTHER && !categoryOther) {
    throw ApiError.badRequest('Describe the category when choosing "Other"');
  }
  const [customer, installer] = await Promise.all([
    Customer.findById(customerId),
    Installer.findOne({ _id: installerId, active: true }),
  ]);
  if (!customer) throw ApiError.badRequest('Customer not found');
  if (!installer) throw ApiError.badRequest('Select a valid installer');

  const now = new Date();
  const deadlines = await computeDeadlines(priority, now);
  const actor = actorOf(req);

  const complaint = new Complaint({
    complaintNumber: await generateComplaintNumber(),
    customer: customer._id,
    customerSnapshot: {
      customerCode: customer.customerCode,
      name: customer.name,
      mobile: customer.mobile,
      address: customer.address,
      cityVillage: customer.cityVillage,
      projectId: customer.projectId,
      systemSizeKw: customer.systemSizeKw,
      installationDate: customer.installationDate,
      inverter: customer.inverter,
      panels: customer.panels,
    },
    category,
    categoryOther: category === ComplaintCategory.OTHER ? categoryOther : undefined,
    description,
    priority,
    assignedInstaller: installer._id,
    assignedInstallerName: installer.name,
    assignedAt: now,
    status: S.NEW,
    createdBy: req.user!.id,
    createdByName: req.user!.name,
    ...deadlines,
  });
  addTimeline(complaint, TimelineEvent.CREATED, `Complaint created by ${actor.name}`, actor);
  addTimeline(complaint, TimelineEvent.ASSIGNED, `Assigned to ${installer.name}`, actor);
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_CREATED, complaint, `Assigned to ${installer.name}, priority ${priority}`);
  await notify({
    type: NotificationType.COMPLAINT_ASSIGNED,
    complaint,
    message: `New ${priority.toLowerCase()} priority complaint ${complaint.complaintNumber} - ${customer.name}, ${category}`,
    audiences: [{ installerId: installer._id }],
  });

  respond(req, res, complaint, 201);
});

export const updateComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, [...OPEN_STATUSES, S.RESOLVED_BY_INSTALLER], 'edit the complaint');
  const { category, categoryOther, description, priority } = req.body;
  const changes: string[] = [];

  if (category && category !== complaint.category) {
    changes.push(`category "${complaint.category}" → "${category}"`);
    complaint.category = category;
  }
  if (complaint.category === ComplaintCategory.OTHER) {
    if (categoryOther !== undefined) complaint.categoryOther = categoryOther || undefined;
    if (!complaint.categoryOther) throw ApiError.badRequest('Describe the category when choosing "Other"');
  } else {
    complaint.categoryOther = undefined;
  }
  if (description && description !== complaint.description) {
    changes.push('description updated');
    complaint.description = description;
  }
  if (priority && priority !== complaint.priority) {
    changes.push(`priority ${complaint.priority} → ${priority}`);
    complaint.priority = priority;
    const deadlines = await computeDeadlines(priority, complaint.assignedAt);
    complaint.responseDueAt = deadlines.responseDueAt;
    complaint.dueDate = deadlines.dueDate;
    complaint.overdueNotifiedAt = undefined;
  }

  if (changes.length) {
    const actor = actorOf(req);
    addTimeline(complaint, TimelineEvent.UPDATED, `Complaint edited by ${actor.name}: ${changes.join(', ')}`, actor);
    await complaint.save();
    await audit(req, AuditAction.COMPLAINT_UPDATED, complaint, changes.join(', '));
  }
  respond(req, res, complaint);
});

export const reassignComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, OPEN_STATUSES, 'reassign');

  const installer = await Installer.findOne({ _id: req.body.installerId, active: true });
  if (!installer) throw ApiError.badRequest('Select a valid installer');
  if (String(installer._id) === String(complaint.assignedInstaller)) {
    throw ApiError.badRequest(`Already assigned to ${installer.name}`);
  }

  const previous = { id: complaint.assignedInstaller, name: complaint.assignedInstallerName };
  const now = new Date();
  const actor = actorOf(req);

  complaint.assignedInstaller = installer._id;
  complaint.assignedInstallerName = installer.name;
  complaint.assignedAt = now;
  // The new installer has not agreed to anything yet: back to NEW, with a fresh response window.
  complaint.status = S.NEW;
  complaint.acceptedBy = undefined;
  complaint.acceptedByName = undefined;
  complaint.acceptedAt = undefined;
  complaint.scheduledVisit = undefined;
  complaint.responseDueAt = (await computeDeadlines(complaint.priority, now)).responseDueAt;
  complaint.overdueNotifiedAt = undefined;
  addTimeline(
    complaint,
    TimelineEvent.REASSIGNED,
    `Previously assigned to ${previous.name}. Reassigned to ${installer.name} by ${actor.name}` +
      (req.body.reason ? `: ${req.body.reason}` : ''),
    actor,
  );
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_REASSIGNED, complaint, `${previous.name} → ${installer.name}`);
  await notify({
    type: NotificationType.COMPLAINT_ASSIGNED,
    complaint,
    message: `Complaint ${complaint.complaintNumber} - ${complaint.customerSnapshot.name} was assigned to you`,
    audiences: [{ installerId: installer._id }],
  });
  await notify({
    type: NotificationType.COMPLAINT_UNASSIGNED,
    complaint,
    message: `Complaint ${complaint.complaintNumber} was reassigned to another installer`,
    audiences: [{ installerId: previous.id }],
  });

  respond(req, res, complaint);
});

export const recordConfirmation = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  await applyCustomerConfirmation(complaint, req.body.status, 'OFFICE', actorOf(req), req.body.note);
  await audit(req, AuditAction.COMPLAINT_CONFIRMATION, complaint, req.body.status);
  respond(req, res, complaint);
});

export const closeComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, [...OPEN_STATUSES, S.RESOLVED_BY_INSTALLER], 'close');
  // Closing without the installer's resolution is allowed (e.g. a duplicate or mistaken ticket) but must be explained.
  if (complaint.status !== S.RESOLVED_BY_INSTALLER && !req.body.note) {
    throw ApiError.badRequest('This complaint has not been resolved by the installer. Add a note explaining why it is being closed.');
  }

  const actor = actorOf(req);
  complaint.status = S.CLOSED;
  complaint.closedAt = new Date();
  complaint.closedBy = new Types.ObjectId(req.user!.id);
  complaint.closedByName = req.user!.name;
  addTimeline(
    complaint,
    TimelineEvent.CLOSED,
    `Complaint closed by ${actor.name}${req.body.note ? `: ${req.body.note}` : ''}`,
    actor,
  );
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_CLOSED, complaint, req.body.note);
  await notify({
    type: NotificationType.COMPLAINT_CLOSED,
    complaint,
    message: `${complaint.complaintNumber} was closed by the office`,
    audiences: [{ installerId: complaint.assignedInstaller }],
  });
  respond(req, res, complaint);
});

export const reopen = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, [S.RESOLVED_BY_INSTALLER, S.CLOSED], 'reopen');
  await reopenComplaint(complaint, req.body.reason, actorOf(req));
  await audit(req, AuditAction.COMPLAINT_REOPENED, complaint, req.body.reason);
  respond(req, res, complaint);
});

/** Soft delete: the ticket and its whole history stay in the database, hidden from normal lists. */
export const archiveComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (complaint.archived) throw ApiError.conflict('Complaint is already archived');
  const actor = actorOf(req);
  complaint.archived = true;
  complaint.archivedAt = new Date();
  complaint.archivedByName = actor.name;
  complaint.archiveReason = req.body.reason;
  addTimeline(complaint, TimelineEvent.ARCHIVED, `Archived by ${actor.name}: ${req.body.reason}`, actor, 'ADMIN');
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_ARCHIVED, complaint, req.body.reason);
  respond(req, res, complaint);
});

export const restoreComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (!complaint.archived) throw ApiError.conflict('Complaint is not archived');
  const actor = actorOf(req);
  complaint.archived = false;
  complaint.archivedAt = undefined;
  complaint.archivedByName = undefined;
  complaint.archiveReason = undefined;
  addTimeline(complaint, TimelineEvent.RESTORED, `Restored by ${actor.name}`, actor, 'ADMIN');
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_RESTORED, complaint);
  respond(req, res, complaint);
});

/* ------------------------------------------------------------------ */
/* Installer progress, recorded by the office                          */
/* ------------------------------------------------------------------ */

export const acceptComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, [S.NEW, S.REOPENED], 'accept');

  const now = new Date();
  complaint.status = S.ACCEPTED;
  complaint.acceptedBy = new Types.ObjectId(req.user!.id);
  complaint.acceptedByName = req.user!.name;
  complaint.acceptedAt = now;
  addTimeline(complaint, TimelineEvent.ACCEPTED, `Accepted by ${complaint.assignedInstallerName} (recorded by ${req.user!.name})`, actorOf(req));
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_ACCEPTED, complaint);
  await notify({
    type: NotificationType.COMPLAINT_ACCEPTED,
    complaint,
    message: `${complaint.assignedInstallerName} accepted ${complaint.complaintNumber}`,
    audiences: ['ADMIN'],
  });
  respond(req, res, complaint);
});

export const scheduleVisit = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (complaint.status === S.NEW) throw ApiError.conflict('Accept the complaint before scheduling a visit');
  assertStatus(complaint, WORKING_STATUSES, 'schedule a visit');

  const { at, technician, note } = req.body;
  const isReschedule = Boolean(complaint.scheduledVisit);
  const visit = { at, technician, note, scheduledByName: req.user!.name, scheduledAt: new Date() };
  complaint.scheduledVisit = visit;
  complaint.visits.push(visit);
  complaint.status = S.VISIT_SCHEDULED;
  addTimeline(
    complaint,
    TimelineEvent.VISIT_SCHEDULED,
    `Visit ${isReschedule ? 'rescheduled' : 'scheduled'} for ${formatWhen(at)}` +
      (technician ? ` - technician: ${technician}` : '') +
      (note ? ` - ${note}` : ''),
    actorOf(req),
  );
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_VISIT_SCHEDULED, complaint, formatWhen(at));
  await notify({
    type: NotificationType.VISIT_SCHEDULED,
    complaint,
    message: `${complaint.assignedInstallerName} scheduled a visit for ${complaint.complaintNumber} on ${formatWhen(at)}`,
    audiences: ['ADMIN'],
  });
  respond(req, res, complaint);
});

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (complaint.status === S.NEW) throw ApiError.conflict('Accept the complaint first');
  assertStatus(complaint, WORKING_STATUSES, 'update the status');

  const { status, note } = req.body as { status: ComplaintStatus; note?: string };
  if (status === complaint.status) throw ApiError.badRequest(`Complaint is already ${STATUS_LABEL[status]}`);

  const from = complaint.status;
  complaint.status = status;
  addTimeline(
    complaint,
    TimelineEvent.STATUS_CHANGED,
    `Status changed: ${STATUS_LABEL[from]} → ${STATUS_LABEL[status]}${note ? ` - ${note}` : ''}`,
    actorOf(req),
  );
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_STATUS_CHANGED, complaint, `${from} → ${status}`);
  respond(req, res, complaint);
});

function applyServiceReport(complaint: IComplaint, body: any): void {
  if (body.diagnosis !== undefined) complaint.diagnosis = body.diagnosis;
  if (body.actionTaken !== undefined) complaint.actionTaken = body.actionTaken;
  if (body.partsUsed !== undefined) complaint.partsUsed = body.partsUsed;
  if (body.serviceNotes !== undefined) complaint.serviceNotes = body.serviceNotes;
}

export const saveServiceReport = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (complaint.status === S.NEW) throw ApiError.conflict('Accept the complaint first');
  assertStatus(complaint, WORKING_STATUSES, 'update the service report');

  applyServiceReport(complaint, req.body);
  addTimeline(complaint, TimelineEvent.SERVICE_REPORT_UPDATED, `Service report updated by ${actorLabel(req)}`, actorOf(req));
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_SERVICE_REPORT, complaint);
  respond(req, res, complaint);
});

export const resolveComplaint = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  if (complaint.status === S.NEW) throw ApiError.conflict('Accept the complaint first');
  assertStatus(complaint, WORKING_STATUSES, 'mark as resolved');

  applyServiceReport(complaint, req.body);
  if (!complaint.diagnosis || !complaint.actionTaken) {
    throw ApiError.badRequest('Enter the problem diagnosed and the action taken before marking as resolved');
  }

  const now = new Date();
  // Photos added since the previous resolution belong to this one.
  const alreadyLinked = new Set(complaint.resolutions.flatMap((r) => r.photoIds.map(String)));
  complaint.resolutions.push({
    diagnosis: complaint.diagnosis,
    actionTaken: complaint.actionTaken,
    partsUsed: complaint.partsUsed.map((p) => ({ name: p.name, quantity: p.quantity })),
    notes: complaint.serviceNotes,
    photoIds: complaint.photos.filter((p) => !alreadyLinked.has(String(p._id))).map((p) => p._id),
    installerName: complaint.assignedInstallerName,
    resolvedBy: new Types.ObjectId(req.user!.id),
    resolvedByName: req.user!.name,
    resolvedAt: now,
  });
  // The installer never closes a complaint - the office does, after the customer confirms.
  complaint.status = S.RESOLVED_BY_INSTALLER;
  complaint.resolvedAt = now;
  complaint.customerConfirmation = { status: ConfirmationStatus.PENDING, requestedAt: now };
  addTimeline(complaint, TimelineEvent.RESOLVED, `Resolved by ${complaint.assignedInstallerName} (recorded by ${req.user!.name})`, actorOf(req));
  await complaint.save();

  await audit(req, AuditAction.COMPLAINT_RESOLVED, complaint);
  await notify({
    type: NotificationType.COMPLAINT_RESOLVED,
    complaint,
    message: `${complaint.assignedInstallerName} resolved ${complaint.complaintNumber} - review and close`,
    audiences: ['ADMIN'],
  });
  respond(req, res, complaint);
});

/* ------------------------------------------------------------------ */
/* Excel sheet for the installer                                       */
/* ------------------------------------------------------------------ */

// The office works in India; a "day" on the sheet is an IST calendar day wherever the server runs.
const istDayStart = (day: string) => new Date(`${day}T00:00:00.000+05:30`);
const istDayEnd = (day: string) => new Date(`${day}T23:59:59.999+05:30`);

export const exportSheet = catchAsync(async (req: Request, res: Response) => {
  const { installer: installerId, from, to, pending } = req.query as Record<string, string>;
  const installer = await Installer.findById(installerId);
  if (!installer) throw ApiError.badRequest('Select a valid installer');
  if (from > to) throw ApiError.badRequest('The "from" date is after the "to" date');

  const inPeriod = { createdAt: { $gte: istDayStart(from), $lte: istDayEnd(to) } };
  const complaints = await Complaint.find({
    archived: false,
    assignedInstaller: installer._id,
    // Optionally carry forward everything still open, so nothing older is forgotten.
    ...(pending === 'true' ? { $or: [inPeriod, { status: { $in: OPEN_STATUSES } }] } : inPeriod),
  }).sort({ createdAt: 1 });

  if (!complaints.length) {
    throw ApiError.notFound(`No complaints for ${installer.name} in this period`);
  }

  const label = (day: string) =>
    istDayStart(day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const period = from === to ? `Complaints of ${label(from)}` : `Complaints from ${label(from)} to ${label(to)}`;
  const buffer = await buildInstallerSheet({
    installerName: installer.name,
    periodLabel: pending === 'true' ? `${period} + all pending` : period,
    complaints,
  });

  const actor = actorOf(req);
  const now = new Date();
  await Complaint.updateMany(
    { _id: { $in: complaints.map((c) => c._id) } },
    {
      $set: { lastExportedAt: now },
      $push: {
        timeline: {
          type: TimelineEvent.SHEET_EXPORTED,
          message: `Included in the Excel sheet for ${installer.name}, downloaded by ${actor.name}`,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          visibility: 'ALL',
          at: now,
        },
      },
    },
  );
  await recordAudit({
    action: AuditAction.COMPLAINTS_EXPORTED,
    actor,
    targetType: 'Installer',
    targetId: installer._id.toString(),
    targetLabel: installer.name,
    details: `${complaints.length} complaints, ${from} to ${to}${pending === 'true' ? ' + pending' : ''}`,
    req,
  });

  const filename = `${installer.name.replace(/[^a-zA-Z0-9]+/g, '-')}_Complaints_${from}${from === to ? '' : `_to_${to}`}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

/**
 * Reads back a sheet the installer filled in. Without ?apply=true it only
 * returns what would change, so the office can check before saving.
 */
export const importSheet = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('Choose the filled-in Excel sheet to upload');
  const apply = req.query.apply === 'true';
  const actor = actorOf(req);
  const result = await importInstallerSheet(req.file.buffer, actor, apply);

  if (apply) {
    await recordAudit({
      action: AuditAction.COMPLAINTS_IMPORTED,
      actor,
      targetType: 'Installer',
      targetLabel: result.installerName,
      details: `${result.summary.RESOLVED} resolved, ${result.summary.UPDATED} updated, ${result.summary.SKIPPED} skipped (${req.file.originalname.slice(0, 80)})`,
      req,
    });
  }
  res.json(result);
});

/* ------------------------------------------------------------------ */
/* Notes and photos                                                    */
/* ------------------------------------------------------------------ */

export const addNote = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  const isAdmin = req.user!.role === UserRole.ADMIN;
  // Only the office can write internal notes; they are never sent to installers.
  const internal = isAdmin && req.body.internal === true;

  addTimeline(
    complaint,
    internal ? TimelineEvent.INTERNAL_NOTE : TimelineEvent.NOTE,
    req.body.text,
    { ...actorOf(req), name: actorLabel(req) },
    internal ? 'ADMIN' : 'ALL',
  );
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_NOTE_ADDED, complaint, internal ? 'Internal note' : 'Note');
  respond(req, res, complaint);
});

export const uploadPhotos = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  assertStatus(complaint, [...OPEN_STATUSES, S.RESOLVED_BY_INSTALLER], 'upload photos');
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw ApiError.badRequest('Choose at least one photo');
  if (complaint.photos.length + files.length > 40) throw ApiError.badRequest('Too many photos on this complaint');

  const kind = req.body.kind;
  const now = new Date();
  for (const file of files) {
    const stored = await savePhoto(file.buffer, complaint.complaintNumber);
    complaint.photos.push({
      _id: new Types.ObjectId(),
      kind,
      ...stored,
      uploadedBy: new Types.ObjectId(req.user!.id),
      uploadedByName: actorLabel(req),
      uploadedAt: now,
    });
  }
  addTimeline(
    complaint,
    TimelineEvent.PHOTOS_UPLOADED,
    `${files.length} ${kind.toLowerCase()} photo${files.length > 1 ? 's' : ''} uploaded by ${actorLabel(req)}`,
    actorOf(req),
  );
  await complaint.save();
  await audit(req, AuditAction.COMPLAINT_PHOTOS_UPLOADED, complaint, `${files.length} ${kind}`);
  respond(req, res, complaint, 201);
});

/** Streams a photo only after the same permission check as the complaint itself - there is no public photo URL. */
export const getPhoto = catchAsync(async (req: Request, res: Response) => {
  const complaint = await loadComplaintFor(req, req.params.id);
  const photo = complaint.photos.find((p) => String(p._id) === req.params.photoId);
  if (!photo) throw ApiError.notFound('Photo not found');

  let buffer: Buffer;
  try {
    buffer = await readPhoto(photo);
  } catch {
    throw ApiError.notFound('Photo file is unavailable');
  }
  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(buffer);
});
