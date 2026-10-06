import { describe, it, expect } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../src/app';
import { Complaint } from '../src/models/Complaint';
import { parseParts } from '../src/services/import.service';
import { createComplaint, setupWorld } from './helpers';

type World = Awaited<ReturnType<typeof setupWorld>>;

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const binary = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

// Columns of the exported sheet that the installer fills in.
const COL = { number: 2, visit: 16, problem: 17, work: 18, parts: 19, remarks: 20 };

/** Downloads the installer's sheet exactly as the office would, lets the test fill it in, and returns the file. */
async function filledSheet(world: World, installerId: unknown, fill: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const res = await request(app)
    .get(`/api/complaints/export?installer=${installerId}&from=${today()}&to=${today()}`)
    .set('Cookie', world.admin.cookie)
    .buffer(true)
    .parse(binary);
  expect(res.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  fill(workbook.worksheets[0]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function upload(world: World, file: Buffer, apply: boolean, filename = 'AP-Enterprise_Complaints.xlsx') {
  return request(app)
    .post(`/api/complaints/import${apply ? '?apply=true' : ''}`)
    .set('Cookie', world.admin.cookie)
    .attach('file', file, filename);
}

const rowFor = (sheet: ExcelJS.Worksheet, complaintNumber: string) => {
  for (let r = 5; r <= sheet.rowCount; r += 1) {
    if (sheet.getRow(r).getCell(COL.number).value === complaintNumber) return sheet.getRow(r);
  }
  throw new Error(`${complaintNumber} not on the sheet`);
};

describe('Importing a filled-in sheet', () => {
  it('previews first, then resolves, updates and leaves untouched rows alone', async () => {
    const world = await setupWorld();
    await createComplaint(world, world.ap._id); // 000001 - fully filled in
    await createComplaint(world, world.ap._id); // 000002 - visit date only
    await createComplaint(world, world.ap._id); // 000003 - left blank

    const file = await filledSheet(world, world.ap._id, (sheet) => {
      const done = rowFor(sheet, 'SC-CMP-000001');
      done.getCell(COL.visit).value = '07/10/2026 9:30 am';
      done.getCell(COL.problem).value = 'Loose DC connection';
      done.getCell(COL.work).value = 'Connection tightened and tested';
      done.getCell(COL.parts).value = 'MC4 connector x 2, DC cable';
      done.getCell(COL.remarks).value = 'Customer advised to clean panels';
      rowFor(sheet, 'SC-CMP-000002').getCell(COL.visit).value = '08 Oct 2026';
    });

    const preview = await upload(world, file, false);
    expect(preview.status).toBe(200);
    expect(preview.body.applied).toBe(false);
    expect(preview.body.installerName).toBe('AP Enterprise');
    expect(preview.body.summary).toEqual({ RESOLVED: 1, UPDATED: 1, NO_CHANGE: 1, SKIPPED: 0 });
    expect(preview.body.rows[0].changes).toContain('Marked Resolved by Installer');
    // A preview saves nothing.
    expect(await Complaint.countDocuments({ status: 'NEW' })).toBe(3);

    const applied = await upload(world, file, true);
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(true);

    const first = (await Complaint.findOne({ complaintNumber: 'SC-CMP-000001' }))!;
    expect(first.status).toBe('RESOLVED_BY_INSTALLER');
    expect(first.diagnosis).toBe('Loose DC connection');
    expect(first.actionTaken).toBe('Connection tightened and tested');
    expect(first.partsUsed.map((p) => [p.name, p.quantity])).toEqual([
      ['MC4 connector', 2],
      ['DC cable', 1],
    ]);
    expect(first.serviceNotes).toBe('Customer advised to clean panels');
    expect(first.acceptedAt).toBeTruthy();
    expect(first.resolutions).toHaveLength(1);
    expect(first.customerConfirmation!.status).toBe('PENDING');
    // 07/10/2026 9:30 am is read day-first, as India time.
    expect(first.scheduledVisit!.at.toISOString()).toBe('2026-10-07T04:00:00.000Z');
    expect(first.timeline.at(-1)!.message).toBe(
      'Resolved by AP Enterprise (from the returned Excel sheet, imported by Office Admin)',
    );

    const second = (await Complaint.findOne({ complaintNumber: 'SC-CMP-000002' }))!;
    expect(second.status).toBe('VISIT_SCHEDULED');
    expect(second.scheduledVisit!.at.toISOString()).toBe('2026-10-08T04:30:00.000Z'); // no time given -> 10:00 am IST

    const third = (await Complaint.findOne({ complaintNumber: 'SC-CMP-000003' }))!;
    expect(third.status).toBe('NEW');
    // Only the sheet-download entry was added by the export; the import left it alone.
    expect(third.timeline.map((t) => t.type)).toEqual(['CREATED', 'ASSIGNED', 'SHEET_EXPORTED']);

    // Uploading the same file again changes nothing.
    const again = await upload(world, file, true);
    expect(again.body.summary).toEqual({ RESOLVED: 0, UPDATED: 0, NO_CHANGE: 2, SKIPPED: 1 });
    expect((await Complaint.findOne({ complaintNumber: 'SC-CMP-000001' }))!.resolutions).toHaveLength(1);
  });

  it('does not resolve without a problem found, and flags a date it cannot read', async () => {
    const world = await setupWorld();
    await createComplaint(world, world.ap._id);
    const file = await filledSheet(world, world.ap._id, (sheet) => {
      const row = rowFor(sheet, 'SC-CMP-000001');
      row.getCell(COL.visit).value = 'next week sometime';
      row.getCell(COL.work).value = 'Replaced fuse';
    });

    const res = await upload(world, file, true);
    expect(res.body.rows[0].outcome).toBe('UPDATED');
    expect(res.body.rows[0].warnings).toHaveLength(2);

    const complaint = (await Complaint.findOne({ complaintNumber: 'SC-CMP-000001' }))!;
    expect(complaint.status).toBe('IN_PROGRESS');
    expect(complaint.actionTaken).toBe('Replaced fuse');
    expect(complaint.scheduledVisit).toBeUndefined();
    expect(complaint.resolutions).toHaveLength(0);
  });

  it('skips rows it should not touch: reassigned, closed, unknown and duplicate numbers', async () => {
    const world = await setupWorld();
    const office = (url: string, body: object = {}) =>
      request(app).post(url).set('Cookie', world.admin.cookie).send(body);
    const reassigned = (await createComplaint(world, world.ap._id)).body.complaint; // 000001
    const closed = (await createComplaint(world, world.ap._id)).body.complaint; // 000002
    await createComplaint(world, world.ap._id); // 000003

    const file = await filledSheet(world, world.ap._id, (sheet) => {
      for (const number of ['SC-CMP-000001', 'SC-CMP-000002', 'SC-CMP-000003']) {
        const row = rowFor(sheet, number);
        row.getCell(COL.problem).value = 'Fault found';
        row.getCell(COL.work).value = 'Fault fixed';
      }
      const extra = sheet.addRow([]);
      extra.getCell(COL.number).value = 'SC-CMP-000003';
      extra.getCell(COL.work).value = 'Something else entirely';
      const unknown = sheet.addRow([]);
      unknown.getCell(COL.number).value = 'SC-CMP-999999';
      unknown.getCell(COL.work).value = 'Work on a complaint that does not exist';
    });

    // After the sheet went out: one complaint moved to Navia, one was closed by the office.
    await office(`/api/complaints/${reassigned.id}/reassign`, { installerId: String(world.navia._id) });
    await office(`/api/complaints/${closed.id}/close`, { note: 'Duplicate' });

    const res = await upload(world, file, true);
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ RESOLVED: 1, UPDATED: 0, NO_CHANGE: 0, SKIPPED: 4 });
    const reasons = res.body.rows.filter((r: any) => r.outcome === 'SKIPPED').map((r: any) => r.reason);
    expect(reasons[0]).toBe('Now assigned to Navia, but this sheet is from AP Enterprise');
    expect(reasons[1]).toBe('Already closed');
    expect(reasons[2]).toContain('appears more than once');
    expect(reasons[3]).toBe('No complaint with this number');

    expect((await Complaint.findById(reassigned.id))!.status).toBe('NEW');
    expect((await Complaint.findById(reassigned.id))!.diagnosis).toBeUndefined();
    expect((await Complaint.findOne({ complaintNumber: 'SC-CMP-000003' }))!.actionTaken).toBe('Fault fixed');
  });

  it('rejects files that are not a complaint sheet, and requires an office login', async () => {
    const world = await setupWorld();
    const other = new ExcelJS.Workbook();
    other.addWorksheet('Sheet1').addRow(['Name', 'Amount']);
    const otherFile = Buffer.from(await other.xlsx.writeBuffer());

    const wrongSheet = await upload(world, otherFile, true);
    expect(wrongSheet.status).toBe(400);
    expect(wrongSheet.body.message).toContain('does not look like a complaint sheet');

    expect((await upload(world, Buffer.from('not excel at all'), true)).status).toBe(400);
    expect((await upload(world, otherFile, true, 'sheet.csv')).status).toBe(400);
    expect((await request(app).post('/api/complaints/import').set('Cookie', world.admin.cookie)).status).toBe(400);
    expect((await request(app).post('/api/complaints/import').attach('file', otherFile, 'a.xlsx')).status).toBe(401);
  });

  it('reads parts written in the usual ways', () => {
    expect(parseParts('MC4 connector x 2, 3 x Fuse\nDC cable 5m; Lug*4')).toEqual([
      { name: 'MC4 connector', quantity: 2 },
      { name: 'Fuse', quantity: 3 },
      { name: 'DC cable 5m', quantity: 1 },
      { name: 'Lug', quantity: 4 },
    ]);
  });
});
