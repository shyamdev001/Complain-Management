import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { Complaint, IComplaint, IPart } from '../models/Complaint';
import { ComplaintStatus, ConfirmationStatus, NotificationType, TimelineEvent } from '../types/enums';
import { ApiError } from '../utils/ApiError';
import { Actor, addTimeline } from './complaint.service';
import { notify } from './notification.service';

const S = ComplaintStatus;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The columns the installer fills in. Matched by header text, so reordering or adding columns does not break import. */
const FILL_COLUMNS = {
  number: 'complaint no',
  visit: 'visit date',
  problem: 'problem found',
  work: 'work done',
  parts: 'parts used',
  remarks: 'installer remarks',
} as const;

export type ImportOutcome = 'RESOLVED' | 'UPDATED' | 'NO_CHANGE' | 'SKIPPED';

export interface ImportRow {
  row: number;
  complaintNumber: string;
  customerName?: string;
  outcome: ImportOutcome;
  /** What will change / has changed, in plain words. */
  changes: string[];
  /** Things the office should look at (unreadable date, missing diagnosis...). */
  warnings: string[];
  /** Why a row was skipped. */
  reason?: string;
  newStatus?: ComplaintStatus;
}

export interface ImportResult {
  applied: boolean;
  installerName?: string;
  rows: ImportRow[];
  summary: Record<ImportOutcome, number>;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(cell.text ?? '').trim();
}

/** Builds a real instant from an India wall-clock date and time. */
function istDate(year: number, month: number, day: number, hour = 10, minute = 0): Date | null {
  const date = new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS);
  const check = new Date(date.getTime() + IST_OFFSET_MS);
  // Rejects impossible dates like 31/02 that Date would silently roll over.
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month) return null;
  return date;
}

function to24h(hour: number, meridiem?: string): number {
  const m = meridiem?.toLowerCase();
  if (m === 'pm' && hour < 12) return hour + 12;
  if (m === 'am' && hour === 12) return 0;
  return hour;
}

/**
 * Reads the Visit Date cell however the installer typed it: a real Excel
 * date, "07/10/2026", "7-10-26 9:30", or "07 Oct 2026, 09:00 am". Indian
 * day-first order is assumed. A date without a time is taken as 10:00 am.
 */
export function parseVisitDate(cell: ExcelJS.Cell): { date: Date | null; raw: string } {
  const value = cell.value;
  if (value instanceof Date) {
    // Excel stores wall-clock time with no zone; exceljs exposes it as UTC. Read it as India time.
    const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0;
    return {
      date: istDate(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        hasTime ? value.getUTCHours() : 10,
        hasTime ? value.getUTCMinutes() : 0,
      ),
      raw: value.toISOString(),
    };
  }

  const raw = cellText(cell);
  if (!raw) return { date: null, raw };
  const time = /(\d{1,2})[:.](\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)/i;

  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b(.*)$/.exec(raw);
  const named = /^(\d{1,2})[\s\-]+([a-z]{3})[a-z]*[\s\-,]+(\d{2}|\d{4})\b(.*)$/i.exec(raw);
  const match = numeric ?? named;
  if (!match) return { date: null, raw };

  const day = Number(match[1]);
  const month = numeric ? Number(match[2]) - 1 : MONTHS.indexOf(match[2].toLowerCase());
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  if (month < 0 || month > 11) return { date: null, raw };

  const t = time.exec(match[4] ?? '');
  const hour = t ? to24h(Number(t[1] ?? t[4]), t[3] ?? t[5]) : 10;
  const minute = t && t[2] ? Number(t[2]) : 0;
  if (hour > 23 || minute > 59) return { date: null, raw };
  return { date: istDate(year, month, day, hour, minute), raw };
}

/** "MC4 connector x 2, DC cable 5m" -> [{MC4 connector, 2}, {DC cable 5m, 1}] */
export function parseParts(text: string): IPart[] {
  return text
    .split(/[,;\n]+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const after = /^(.+?)\s*[x×*]\s*(\d+(?:\.\d+)?)$/i.exec(piece);
      if (after) return { name: after[1].trim(), quantity: Number(after[2]) };
      const before = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(.+)$/i.exec(piece);
      if (before) return { name: before[2].trim(), quantity: Number(before[1]) };
      return { name: piece, quantity: 1 };
    })
    .map((part) => ({ name: part.name.slice(0, 120), quantity: part.quantity }));
}

const fmt = (date: Date) =>
  date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Reads a sheet the installer filled in and returned, and updates each
 * complaint from its row. With `apply: false` nothing is saved - the same
 * result is returned as a preview so the office can check it first.
 *
 * Per row: an untouched row changes nothing; any entry means the installer
 * has accepted the complaint; a visit date schedules the visit; problem found
 * + work done together mark it Resolved by Installer (the office still closes
 * it). Rows for closed, already-resolved, archived, unknown or reassigned
 * complaints are skipped with a reason, never guessed at.
 */
export async function importInstallerSheet(buffer: Buffer, actor: Actor & { id: string }, apply: boolean): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw ApiError.badRequest('This file could not be read. Upload the .xlsx sheet that was downloaded from this system.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw ApiError.badRequest('The file has no sheets.');

  // Locate the header row by its text rather than assuming a fixed position.
  let headerRow = 0;
  const columns: Partial<Record<keyof typeof FILL_COLUMNS, number>> = {};
  for (let r = 1; r <= Math.min(sheet.rowCount, 15) && !headerRow; r += 1) {
    const found: typeof columns = {};
    sheet.getRow(r).eachCell((cell, col) => {
      const text = cellText(cell).toLowerCase();
      for (const [key, header] of Object.entries(FILL_COLUMNS)) {
        if (text === header) found[key as keyof typeof FILL_COLUMNS] = col;
      }
    });
    if (found.number) {
      headerRow = r;
      Object.assign(columns, found);
    }
  }
  const missing = Object.entries(FILL_COLUMNS)
    .filter(([key]) => !columns[key as keyof typeof FILL_COLUMNS])
    .map(([, header]) => header);
  if (!headerRow || missing.length) {
    throw ApiError.badRequest(
      `This does not look like a complaint sheet from this system${missing.length && headerRow ? ` (missing column: ${missing.join(', ')})` : ''}.`,
    );
  }

  // "THE SOLAR COOP - Service Complaints for AP Enterprise"
  const installerName = /complaints for (.+)$/i.exec(cellText(sheet.getCell(1, 1)))?.[1]?.trim();

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  const now = new Date();

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const complaintNumber = cellText(row.getCell(columns.number!)).toUpperCase();
    if (!complaintNumber) continue;

    const result: ImportRow = { row: r, complaintNumber, outcome: 'SKIPPED', changes: [], warnings: [] };
    rows.push(result);
    if (rows.length > 500) throw ApiError.badRequest('The sheet has more than 500 complaint rows.');

    if (seen.has(complaintNumber)) {
      result.reason = 'This complaint number appears more than once in the sheet; only the first row was used';
      continue;
    }
    seen.add(complaintNumber);

    const complaint = await Complaint.findOne({ complaintNumber });
    if (!complaint) {
      result.reason = 'No complaint with this number';
      continue;
    }
    result.customerName = complaint.customerSnapshot.name;
    if (complaint.archived) {
      result.reason = 'Complaint is archived';
      continue;
    }
    if (installerName && installerName.toLowerCase() !== complaint.assignedInstallerName.toLowerCase()) {
      result.reason = `Now assigned to ${complaint.assignedInstallerName}, but this sheet is from ${installerName}`;
      continue;
    }
    if (complaint.status === S.CLOSED || complaint.status === S.RESOLVED_BY_INSTALLER) {
      result.reason = complaint.status === S.CLOSED ? 'Already closed' : 'Already marked resolved';
      continue;
    }

    const visit = parseVisitDate(row.getCell(columns.visit!));
    const problem = cellText(row.getCell(columns.problem!)).slice(0, 2000);
    const work = cellText(row.getCell(columns.work!)).slice(0, 2000);
    const partsText = cellText(row.getCell(columns.parts!));
    const remarks = cellText(row.getCell(columns.remarks!)).slice(0, 2000);

    // The sheet is exported with the visit already scheduled, so an unchanged visit is not an update.
    const visitChanged = Boolean(
      visit.date && (!complaint.scheduledVisit || Math.abs(complaint.scheduledVisit.at.getTime() - visit.date.getTime()) > 60000),
    );
    if (visit.raw && !visit.date) {
      result.warnings.push(`Visit date "${visit.raw}" could not be understood - enter it by hand`);
    }
    const problemChanged = Boolean(problem) && problem !== (complaint.diagnosis ?? '');
    const workChanged = Boolean(work) && work !== (complaint.actionTaken ?? '');
    const parts = parseParts(partsText);
    const partsChanged =
      parts.length > 0 && JSON.stringify(parts) !== JSON.stringify(complaint.partsUsed.map((p) => ({ name: p.name, quantity: p.quantity })));
    const remarksChanged = Boolean(remarks) && remarks !== (complaint.serviceNotes ?? '');

    if (!visitChanged && !problemChanged && !workChanged && !partsChanged && !remarksChanged) {
      result.outcome = 'NO_CHANGE';
      continue;
    }

    const wasAwaiting = complaint.status === S.NEW || complaint.status === S.REOPENED;
    if (wasAwaiting) result.changes.push(`Accepted by ${complaint.assignedInstallerName}`);
    if (visitChanged) result.changes.push(`Visit on ${fmt(visit.date!)}`);
    if (problemChanged) result.changes.push(`Problem found: ${problem}`);
    if (workChanged) result.changes.push(`Work done: ${work}`);
    if (partsChanged) result.changes.push(`Parts used: ${parts.map((p) => `${p.name} x ${p.quantity}`).join(', ')}`);
    if (remarksChanged) result.changes.push(`Remarks: ${remarks}`);

    const diagnosis = problem || complaint.diagnosis;
    const actionTaken = work || complaint.actionTaken;
    // "Work done" on the sheet is the installer saying the job is finished.
    const resolves = Boolean(work && diagnosis);
    if (work && !diagnosis) {
      result.warnings.push('Work done is filled but Problem found is empty - not marked resolved');
    }

    let newStatus: ComplaintStatus;
    if (resolves) newStatus = S.RESOLVED_BY_INSTALLER;
    else if (work || problem) newStatus = S.IN_PROGRESS;
    else if (visitChanged) newStatus = S.VISIT_SCHEDULED;
    else newStatus = wasAwaiting ? S.ACCEPTED : complaint.status;

    result.outcome = resolves ? 'RESOLVED' : 'UPDATED';
    result.newStatus = newStatus;
    if (resolves) result.changes.push('Marked Resolved by Installer');

    if (!apply) continue;
    await applyRow(complaint, {
      actor,
      now,
      wasAwaiting,
      visitDate: visitChanged ? visit.date! : undefined,
      diagnosis,
      actionTaken,
      parts: partsChanged ? parts : undefined,
      remarks: remarksChanged ? remarks : undefined,
      resolves,
      newStatus,
      summary: result.changes,
    });
  }

  if (!rows.length) throw ApiError.badRequest('No complaint rows were found in this sheet.');

  const summary: Record<ImportOutcome, number> = { RESOLVED: 0, UPDATED: 0, NO_CHANGE: 0, SKIPPED: 0 };
  for (const row of rows) summary[row.outcome] += 1;
  return { applied: apply, installerName, rows, summary };
}

async function applyRow(
  complaint: IComplaint,
  p: {
    actor: Actor & { id: string };
    now: Date;
    wasAwaiting: boolean;
    visitDate?: Date;
    diagnosis?: string;
    actionTaken?: string;
    parts?: IPart[];
    remarks?: string;
    resolves: boolean;
    newStatus: ComplaintStatus;
    summary: string[];
  },
): Promise<void> {
  const { actor, now } = p;
  const from = `from the returned Excel sheet, imported by ${actor.name}`;

  if (p.wasAwaiting) {
    complaint.acceptedBy = new Types.ObjectId(actor.id);
    complaint.acceptedByName = actor.name;
    complaint.acceptedAt = now;
    addTimeline(complaint, TimelineEvent.ACCEPTED, `Accepted by ${complaint.assignedInstallerName} (${from})`, actor);
  }
  if (p.visitDate) {
    const visit = { at: p.visitDate, scheduledByName: actor.name, scheduledAt: now };
    complaint.scheduledVisit = visit;
    complaint.visits.push(visit);
    addTimeline(complaint, TimelineEvent.VISIT_SCHEDULED, `Visit date ${fmt(p.visitDate)} (${from})`, actor);
  }
  if (p.diagnosis !== undefined) complaint.diagnosis = p.diagnosis;
  if (p.actionTaken !== undefined) complaint.actionTaken = p.actionTaken;
  if (p.parts) complaint.partsUsed = p.parts;
  if (p.remarks) complaint.serviceNotes = p.remarks;
  complaint.status = p.newStatus;

  if (p.resolves) {
    const alreadyLinked = new Set(complaint.resolutions.flatMap((r) => r.photoIds.map(String)));
    complaint.resolutions.push({
      diagnosis: complaint.diagnosis!,
      actionTaken: complaint.actionTaken!,
      partsUsed: complaint.partsUsed.map((part) => ({ name: part.name, quantity: part.quantity })),
      notes: complaint.serviceNotes,
      photoIds: complaint.photos.filter((photo) => !alreadyLinked.has(String(photo._id))).map((photo) => photo._id),
      installerName: complaint.assignedInstallerName,
      resolvedBy: new Types.ObjectId(actor.id),
      resolvedByName: actor.name,
      resolvedAt: now,
    });
    complaint.resolvedAt = now;
    complaint.customerConfirmation = { status: ConfirmationStatus.PENDING, requestedAt: now };
    addTimeline(complaint, TimelineEvent.RESOLVED, `Resolved by ${complaint.assignedInstallerName} (${from})`, actor);
  } else {
    addTimeline(complaint, TimelineEvent.SERVICE_REPORT_UPDATED, `Service details updated (${from})`, actor);
  }
  await complaint.save();

  if (p.resolves) {
    await notify({
      type: NotificationType.COMPLAINT_RESOLVED,
      complaint,
      message: `${complaint.assignedInstallerName} resolved ${complaint.complaintNumber} - review and close`,
      audiences: ['ADMIN'],
    });
  }
}
