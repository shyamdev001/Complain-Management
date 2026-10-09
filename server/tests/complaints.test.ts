import { describe, it, expect } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { Complaint } from '../src/models/Complaint';
import { Notification } from '../src/models/Notification';
import { runOverdueSweep } from '../src/services/overdue.service';
import { createComplaint, setupWorld } from './helpers';

const api = (cookie: string) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string, body: object = {}) => request(app).post(url).set('Cookie', cookie).send(body),
  put: (url: string, body: object = {}) => request(app).put(url).set('Cookie', cookie).send(body),
  patch: (url: string, body: object = {}) => request(app).patch(url).set('Cookie', cookie).send(body),
});

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const binary = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Complaint creation', () => {
  it('creates a complaint with a unique number, timeline and deadlines', async () => {
    const world = await setupWorld();
    const first = await createComplaint(world, world.ap._id);
    const second = await createComplaint(world, world.navia._id);

    expect(first.status).toBe(201);
    expect(first.body.complaint.complaintNumber).toBe('SC-CMP-000001');
    expect(second.body.complaint.complaintNumber).toBe('SC-CMP-000002');
    expect(first.body.complaint.status).toBe('NEW');
    expect(first.body.complaint.assignedInstallerName).toBe('AP Enterprise');
    expect(first.body.complaint.customerSnapshot.name).toBe('Ramesh Patel');
    expect(first.body.complaint.timeline.map((t: any) => t.type)).toEqual(['CREATED', 'ASSIGNED']);
    expect(first.body.complaint.dueDate).toBeTruthy();
  });

  it('requires the installer to be chosen explicitly', async () => {
    const world = await setupWorld();
    const res = await createComplaint(world, world.ap._id, { installerId: undefined });
    expect(res.status).toBe(400);
  });

  it('requires a description of the category when "Other" is chosen', async () => {
    const world = await setupWorld();
    const res = await createComplaint(world, world.ap._id, { category: 'Other' });
    expect(res.status).toBe(400);
  });

  it('shows the office the open complaints a customer already has', async () => {
    const world = await setupWorld();
    await createComplaint(world, world.ap._id);
    const res = await api(world.admin.cookie).get(`/api/customers/${world.customer._id}`);
    expect(res.status).toBe(200);
    expect(res.body.openComplaints).toHaveLength(1);
    expect(res.body.serviceHistory).toHaveLength(1);
  });
});

describe('Access', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/api/complaints')).status).toBe(401);
    expect((await request(app).get('/api/complaints/export')).status).toBe(401);
  });

  it('gives installers no access at all - only office staff can sign in', async () => {
    const world = await setupWorld();
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const installer = api(world.installerUser.cookie);

    expect((await installer.get('/api/complaints')).status).toBe(401);
    expect((await installer.get(`/api/complaints/${id}`)).status).toBe(401);
    expect((await installer.post(`/api/complaints/${id}/accept`)).status).toBe(401);
    expect((await installer.get('/api/customers')).status).toBe(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: world.installerUser.user.email, password: 'Password123!' });
    expect(login.status).toBe(403);
  });
});

describe('Excel sheet for the installer', () => {
  it('downloads only the chosen installer’s complaints for the day and records it', async () => {
    const world = await setupWorld();
    const office = api(world.admin.cookie);
    const apComplaint = (await createComplaint(world, world.ap._id)).body.complaint;
    await createComplaint(world, world.ap._id, { category: 'Inverter issue', priority: 'CRITICAL' });
    await createComplaint(world, world.navia._id);

    const res = await office
      .get(`/api/complaints/export?installer=${world.ap._id}&from=${today()}&to=${today()}`)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain(`AP-Enterprise_Complaints_${today()}.xlsx`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const sheet = workbook.getWorksheet('Complaints')!;
    expect(String(sheet.getCell('A1').value)).toContain('AP Enterprise');
    const headers = (sheet.getRow(4).values as unknown[]).slice(1);
    expect(headers).toContain('Complaint No');
    expect(headers).toContain('Mobile');
    expect(headers).toContain('Work Done');

    const numbers = [5, 6, 7].map((r) => sheet.getRow(r).getCell(2).value).filter(Boolean);
    expect(numbers).toEqual(['SC-CMP-000001', 'SC-CMP-000002']);
    const row = sheet.getRow(5);
    expect(row.getCell(5).value).toBe('Ramesh Patel');
    expect(row.getCell(6).value).toBe('9876543210');
    expect(row.getCell(13).value).toContain('very low for the last 3 days');

    const after = (await office.get(`/api/complaints/${apComplaint.id}`)).body.complaint;
    expect(after.timeline.at(-1).message).toBe('Included in the Excel sheet for AP Enterprise, downloaded by Office Admin');
    expect(after.lastExportedAt).toBeTruthy();
  });

  it('can carry forward older pending complaints, and says so when there is nothing to send', async () => {
    const world = await setupWorld();
    const office = api(world.admin.cookie);
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    // createdAt is immutable through Mongoose, so backdate it directly in the collection.
    await Complaint.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { createdAt: new Date(Date.now() - 5 * 86400000) } },
    );

    const base = `/api/complaints/export?installer=${world.ap._id}&from=${today()}&to=${today()}`;
    const none = await office.get(base);
    expect(none.status).toBe(404);
    expect(none.body.message).toBe('No complaints for AP Enterprise in this period');

    expect((await office.get(`${base}&pending=true`).buffer(true).parse(binary)).status).toBe(200);
    expect((await office.get('/api/complaints/export?installer=bad&from=x&to=y')).status).toBe(400);
  });
});

describe('Service workflow, recorded by the office', () => {
  it('runs the full lifecycle: accept, schedule, report, photos, resolve, confirm, close', async () => {
    const world = await setupWorld();
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const office = api(world.admin.cookie);

    // Nothing can be recorded before the installer has accepted.
    expect((await office.post(`/api/complaints/${id}/schedule`, { at: new Date().toISOString() })).status).toBe(409);

    const accepted = await office.post(`/api/complaints/${id}/accept`);
    expect(accepted.body.complaint.status).toBe('ACCEPTED');
    expect(accepted.body.complaint.acceptedAt).toBeTruthy();
    expect(accepted.body.complaint.timeline.at(-1).message).toBe('Accepted by AP Enterprise (recorded by Office Admin)');
    expect((await office.post(`/api/complaints/${id}/accept`)).status).toBe(409);

    const scheduled = await office.post(`/api/complaints/${id}/schedule`, {
      at: new Date(Date.now() + 86400000).toISOString(),
      technician: 'Mahesh',
      note: 'Morning slot',
    });
    expect(scheduled.body.complaint.status).toBe('VISIT_SCHEDULED');
    expect(scheduled.body.complaint.scheduledVisit.technician).toBe('Mahesh');

    const inProgress = await office.post(`/api/complaints/${id}/status`, { status: 'IN_PROGRESS' });
    expect(inProgress.body.complaint.status).toBe('IN_PROGRESS');
    const waiting = await office.post(`/api/complaints/${id}/status`, { status: 'WAITING_FOR_PARTS' });
    expect(waiting.body.complaint.status).toBe('WAITING_FOR_PARTS');

    // Resolution needs a diagnosis and the action taken.
    expect((await office.post(`/api/complaints/${id}/resolve`, { diagnosis: 'Loose DC connection' })).status).toBe(400);

    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#cc6622' } })
      .png()
      .toBuffer();
    const upload = await request(app)
      .post(`/api/complaints/${id}/photos`)
      .set('Cookie', world.admin.cookie)
      .field('kind', 'BEFORE')
      .attach('photos', png, { filename: 'before.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const photoId = upload.body.complaint.photos[0].id;
    expect(upload.body.complaint.photos[0].key).toBeUndefined();

    const photo = await office.get(`/api/complaints/${id}/photos/${photoId}`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect((await request(app).get(`/api/complaints/${id}/photos/${photoId}`)).status).toBe(401);

    const resolved = await office.post(`/api/complaints/${id}/resolve`, {
      diagnosis: 'Loose DC connection',
      actionTaken: 'DC connection tightened and system tested',
      partsUsed: [{ name: 'MC4 connector', quantity: 2 }],
    });
    expect(resolved.status).toBe(200);
    // Resolved and Closed stay separate steps: closing follows the customer's confirmation.
    expect(resolved.body.complaint.status).toBe('RESOLVED_BY_INSTALLER');
    expect(resolved.body.complaint.resolutions).toHaveLength(1);
    expect(resolved.body.complaint.resolutions[0].partsUsed[0]).toEqual({ name: 'MC4 connector', quantity: 2 });
    expect(resolved.body.complaint.resolutions[0].photoIds).toEqual([photoId]);
    expect(resolved.body.complaint.customerConfirmation.status).toBe('PENDING');

    const confirmed = await office.post(`/api/complaints/${id}/customer-confirmation`, { status: 'CONFIRMED' });
    expect(confirmed.body.complaint.customerConfirmation.status).toBe('CONFIRMED');
    expect(confirmed.body.complaint.status).toBe('RESOLVED_BY_INSTALLER');

    const closed = await office.post(`/api/complaints/${id}/close`);
    expect(closed.body.complaint.status).toBe('CLOSED');
    expect(closed.body.complaint.closedByName).toBe('Office Admin');

    // A closed complaint is frozen until it is reopened.
    expect((await office.post(`/api/complaints/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(409);
  });

  it('reopens without losing the earlier resolution or history', async () => {
    const world = await setupWorld();
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const office = api(world.admin.cookie);
    await office.post(`/api/complaints/${id}/accept`);
    await office.post(`/api/complaints/${id}/resolve`, { diagnosis: 'Loose connection', actionTaken: 'Tightened' });
    await office.post(`/api/complaints/${id}/close`);

    const before = (await office.get(`/api/complaints/${id}`)).body.complaint.timeline.length;
    const reopened = await office.post(`/api/complaints/${id}/reopen`, {
      reason: 'Customer says generation is still low',
    });
    expect(reopened.body.complaint.status).toBe('REOPENED');
    expect(reopened.body.complaint.reopenedCount).toBe(1);
    expect(reopened.body.complaint.resolutions).toHaveLength(1);
    expect(reopened.body.complaint.timeline.length).toBe(before + 1);

    await office.post(`/api/complaints/${id}/status`, { status: 'IN_PROGRESS' });
    const second = await office.post(`/api/complaints/${id}/resolve`, {
      diagnosis: 'Faulty MC4',
      actionTaken: 'Replaced connector',
    });
    expect(second.body.complaint.resolutions).toHaveLength(2);
    expect(second.body.complaint.resolutions[0].diagnosis).toBe('Loose connection');
  });

  it('reopens automatically when the customer says the issue still exists (WhatsApp webhook)', async () => {
    const world = await setupWorld();
    const created = (await createComplaint(world, world.ap._id)).body.complaint;
    const office = api(world.admin.cookie);
    await office.post(`/api/complaints/${created.id}/accept`);
    await office.post(`/api/complaints/${created.id}/resolve`, { diagnosis: 'd', actionTaken: 'a' });

    const body = { complaintNumber: created.complaintNumber, response: 'NOT_RESOLVED' };
    expect((await request(app).post('/api/webhooks/customer-confirmation').send(body)).status).toBe(401);
    const bad = await request(app)
      .post('/api/webhooks/customer-confirmation')
      .set('x-webhook-secret', 'wrong')
      .send(body);
    expect(bad.status).toBe(401);

    const ok = await request(app)
      .post('/api/webhooks/customer-confirmation')
      .set('x-webhook-secret', 'test-webhook-secret')
      .send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('REOPENED');

    const after = await Complaint.findById(created.id);
    expect(after!.customerConfirmation!.status).toBe('NOT_RESOLVED');
    expect(after!.customerConfirmation!.source).toBe('WHATSAPP');
  });

  it('moves a complaint between installers on reassignment and records it', async () => {
    const world = await setupWorld();
    const office = api(world.admin.cookie);
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    await office.post(`/api/complaints/${id}/accept`);

    const res = await office.post(`/api/complaints/${id}/reassign`, {
      installerId: String(world.navia._id),
      reason: 'AP has no technician free',
    });
    expect(res.status).toBe(200);
    expect(res.body.complaint.assignedInstallerName).toBe('Navia');
    expect(res.body.complaint.status).toBe('NEW');
    expect(res.body.complaint.timeline.at(-1).message).toContain(
      'Previously assigned to AP Enterprise. Reassigned to Navia by Office Admin',
    );

    // It now belongs on Navia's sheet, not AP's.
    const base = `/api/complaints/export?from=${today()}&to=${today()}&installer=`;
    expect((await office.get(base + world.ap._id)).status).toBe(404);
    expect((await office.get(base + world.navia._id).buffer(true).parse(binary)).status).toBe(200);
  });

  it('requires a reason to close a complaint the installer has not resolved', async () => {
    const world = await setupWorld();
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const office = api(world.admin.cookie);
    expect((await office.post(`/api/complaints/${id}/close`)).status).toBe(400);
    expect((await office.post(`/api/complaints/${id}/close`, { note: 'Duplicate of SC-CMP-000001' })).status).toBe(200);
  });

  it('archives instead of deleting, and leaves archived complaints off the sheet', async () => {
    const world = await setupWorld();
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const office = api(world.admin.cookie);

    // Office staff cannot delete; archiving is how a complaint is taken out of the way.
    expect((await request(app).delete(`/api/complaints/${id}`).set('Cookie', world.staff.cookie)).status).toBe(403);
    expect((await office.post(`/api/complaints/${id}/archive`, { reason: 'Created by mistake' })).status).toBe(200);

    expect(await Complaint.countDocuments()).toBe(1);
    expect((await office.get('/api/complaints')).body.complaints).toHaveLength(0);
    expect((await office.get('/api/complaints?archived=true')).body.complaints).toHaveLength(1);
    const sheet = await office.get(`/api/complaints/export?installer=${world.ap._id}&from=${today()}&to=${today()}`);
    expect(sheet.status).toBe(404);
  });
});

describe('Overdue and SLA', () => {
  it('flags overdue complaints, notifies once, and applies edited SLA targets', async () => {
    const world = await setupWorld();
    const office = api(world.admin.cookie);
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    await createComplaint(world, world.navia._id);

    await Complaint.updateOne({ _id: id }, { dueDate: new Date(Date.now() - 3600000) });

    const stats = await office.get('/api/complaints/stats');
    expect(stats.body.overdue).toBe(1);
    expect(stats.body.installers.find((i: any) => i.name === 'AP Enterprise').overdue).toBe(1);
    expect(stats.body.installers.find((i: any) => i.name === 'Navia').overdue).toBe(0);

    const overdueList = await office.get('/api/complaints?overdue=true');
    expect(overdueList.body.complaints).toHaveLength(1);
    expect(overdueList.body.complaints[0].isOverdue).toBe(true);

    expect(await runOverdueSweep()).toBe(1);
    expect(await runOverdueSweep()).toBe(0);
    expect(await Notification.countDocuments({ type: 'COMPLAINT_OVERDUE', audience: 'ADMIN' })).toBe(1);
    expect(await Notification.countDocuments()).toBe(1);

    const sla = {
      CRITICAL: { responseHours: 1, resolutionHours: 6 },
      HIGH: { responseHours: 4, resolutionHours: 24 },
      NORMAL: { responseHours: 24, resolutionHours: 48 },
      LOW: { responseHours: 48, resolutionHours: null },
    };
    expect((await office.put('/api/settings/sla', { sla })).status).toBe(200);
    const critical = (await createComplaint(world, world.ap._id, { priority: 'CRITICAL' })).body.complaint;
    const hours = (new Date(critical.dueDate).getTime() - new Date(critical.createdAt).getTime()) / 3600000;
    expect(Math.round(hours)).toBe(6);

    const low = (await createComplaint(world, world.ap._id, { priority: 'LOW' })).body.complaint;
    expect(low.dueDate).toBeUndefined();
  });
});
