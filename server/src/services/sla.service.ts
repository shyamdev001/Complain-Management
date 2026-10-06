import { FilterQuery } from 'mongoose';
import { DEFAULT_SLA, Settings, SlaConfig } from '../models/Settings';
import { IComplaint } from '../models/Complaint';
import { AWAITING_RESPONSE_STATUSES, ComplaintStatus, OPEN_STATUSES, Priority } from '../types/enums';

const SETTINGS_ID = 'global';
const HOUR_MS = 60 * 60 * 1000;

/** SLA targets are stored in the DB (editable from admin settings); defaults apply until first saved. */
export async function getSla(): Promise<SlaConfig> {
  const doc = await Settings.findById(SETTINGS_ID).lean();
  return { ...DEFAULT_SLA, ...(doc?.sla ?? {}) };
}

export async function saveSla(sla: SlaConfig, updatedByName: string): Promise<SlaConfig> {
  await Settings.findByIdAndUpdate(SETTINGS_ID, { sla, updatedByName }, { upsert: true });
  return sla;
}

export async function computeDeadlines(
  priority: Priority,
  from: Date,
): Promise<{ responseDueAt: Date; dueDate?: Date }> {
  const target = (await getSla())[priority];
  return {
    responseDueAt: new Date(from.getTime() + target.responseHours * HOUR_MS),
    dueDate: target.resolutionHours ? new Date(from.getTime() + target.resolutionHours * HOUR_MS) : undefined,
  };
}

/**
 * A complaint is overdue while the installer still owes work on it and either
 * the resolution deadline has passed, or nobody has responded within the
 * response target.
 */
export function overdueFilter(now = new Date()): FilterQuery<IComplaint> {
  return {
    archived: false,
    status: { $in: OPEN_STATUSES },
    $or: [
      { dueDate: { $lt: now } },
      { $and: [{ status: { $in: AWAITING_RESPONSE_STATUSES } }, { responseDueAt: { $lt: now } }] },
    ],
  };
}

export function isOverdue(
  c: { status: ComplaintStatus; dueDate?: Date | null; responseDueAt?: Date | null; archived?: boolean },
  now = new Date(),
): boolean {
  if (c.archived || !OPEN_STATUSES.includes(c.status)) return false;
  if (c.dueDate && c.dueDate < now) return true;
  return Boolean(AWAITING_RESPONSE_STATUSES.includes(c.status) && c.responseDueAt && c.responseDueAt < now);
}
