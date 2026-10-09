import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { Complaint } from '../src/models/Complaint';
import { Customer } from '../src/models/Customer';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { ensureFirstRunData } from '../src/services/bootstrap.service';
import { UserRole } from '../src/types/enums';
import { createComplaint, createUser, setupWorld } from './helpers';

const api = (cookie: string) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string, body: object = {}) => request(app).post(url).set('Cookie', cookie).send(body),
  put: (url: string, body: object = {}) => request(app).put(url).set('Cookie', cookie).send(body),
  patch: (url: string, body: object = {}) => request(app).patch(url).set('Cookie', cookie).send(body),
  delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
});

describe('Office staff', () => {
  it('can do the daily work: customers, complaints, progress, close and reopen', async () => {
    const world = await setupWorld();
    const staff = api(world.staff.cookie);

    const customer = await staff.post('/api/customers', { name: 'Staff Added', mobile: '9812345678' });
    expect(customer.status).toBe(201);

    const created = await staff.post('/api/complaints', {
      customerId: customer.body.customer.id,
      category: 'Inverter issue',
      description: 'Inverter shows a red light',
      priority: 'NORMAL',
      installerId: String(world.ap._id),
    });
    expect(created.status).toBe(201);
    const id = created.body.complaint.id;

    expect((await staff.post(`/api/complaints/${id}/accept`)).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/reassign`, { installerId: String(world.navia._id) })).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/accept`)).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/notes`, { text: 'Called the customer' })).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/resolve`, { diagnosis: 'Fuse', actionTaken: 'Replaced' })).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/close`)).status).toBe(200);
    expect((await staff.post(`/api/complaints/${id}/reopen`, { reason: 'Still not working' })).status).toBe(200);
    expect((await staff.get('/api/complaints')).status).toBe(200);
    expect((await staff.get('/api/installers')).status).toBe(200);
    expect((await staff.get('/api/complaints/stats')).status).toBe(200);
  });

  it('cannot edit, archive or delete records, or reach logins, installers, settings and the audit log', async () => {
    const world = await setupWorld();
    const staff = api(world.staff.cookie);
    const id = (await createComplaint(world, world.ap._id)).body.complaint.id;
    const customerId = String(world.customer._id);

    expect((await staff.patch(`/api/complaints/${id}`, { priority: 'LOW' })).status).toBe(403);
    expect((await staff.post(`/api/complaints/${id}/archive`, { reason: 'hide it' })).status).toBe(403);
    expect((await staff.delete(`/api/complaints/${id}`)).status).toBe(403);
    expect((await staff.patch(`/api/customers/${customerId}`, { name: 'Changed Name' })).status).toBe(403);
    expect((await staff.delete(`/api/customers/${customerId}`)).status).toBe(403);
    expect((await staff.get('/api/users')).status).toBe(403);
    expect((await staff.post('/api/users', { name: 'X Y', email: 'x@y.dev', password: 'Password1' })).status).toBe(403);
    expect((await staff.patch(`/api/users/${world.staff.user._id}/role`, { role: 'SUPER_ADMIN' })).status).toBe(403);
    expect((await staff.post('/api/installers', { name: 'New Installer' })).status).toBe(403);
    expect((await staff.put('/api/settings/sla', {})).status).toBe(403);
    expect((await staff.get('/api/audit-logs')).status).toBe(403);

    const untouched = await Complaint.findById(id);
    expect(untouched!.priority).toBe('HIGH');
    expect(untouched!.archived).toBe(false);
    expect((await Customer.findById(customerId))!.name).toBe('Ramesh Patel');
  });
});

describe('Super admin', () => {
  it('edits and permanently deletes a complaint, leaving an audit record', async () => {
    const world = await setupWorld();
    const boss = api(world.admin.cookie);
    const created = (await createComplaint(world, world.ap._id)).body.complaint;

    expect((await boss.patch(`/api/complaints/${created.id}`, { priority: 'LOW' })).body.complaint.priority).toBe('LOW');
    expect((await boss.delete(`/api/complaints/${created.id}`)).status).toBe(200);

    expect(await Complaint.countDocuments()).toBe(0);
    expect((await boss.get(`/api/complaints/${created.id}`)).status).toBe(404);
    const log = await AuditLog.findOne({ action: 'COMPLAINT_DELETED' });
    expect(log!.targetLabel).toBe(created.complaintNumber);
    expect(log!.actorName).toBe('Office Admin');
    expect(log!.details).toContain('Ramesh Patel');
  });

  it('edits a customer, and deletes one only when it has no complaints', async () => {
    const world = await setupWorld();
    const boss = api(world.admin.cookie);
    const customerId = String(world.customer._id);
    const complaintId = (await createComplaint(world, world.ap._id)).body.complaint.id;

    expect((await boss.patch(`/api/customers/${customerId}`, { cityVillage: 'Nadiad' })).status).toBe(200);

    const blocked = await boss.delete(`/api/customers/${customerId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('1 complaint');
    expect(await Customer.countDocuments()).toBe(1);

    await boss.delete(`/api/complaints/${complaintId}`);
    expect((await boss.delete(`/api/customers/${customerId}`)).status).toBe(200);
    expect(await Customer.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'CUSTOMER_DELETED' })).toBe(1);
  });

  it('creates logins with a role and changes roles, but not its own', async () => {
    const world = await setupWorld();
    const boss = api(world.admin.cookie);

    const made = await boss.post('/api/users', { name: 'Second Boss', email: 'boss2@test.dev', password: 'Password1', role: 'SUPER_ADMIN' });
    expect(made.status).toBe(201);
    expect(made.body.user.role).toBe('SUPER_ADMIN');
    const plain = await boss.post('/api/users', { name: 'New Staff', email: 'staff2@test.dev', password: 'Password1' });
    expect(plain.body.user.role).toBe('ADMIN');

    const promoted = await boss.patch(`/api/users/${world.staff.user._id}/role`, { role: 'SUPER_ADMIN' });
    expect(promoted.body.user.role).toBe('SUPER_ADMIN');
    // The promotion takes effect at once, without signing in again.
    expect((await api(world.staff.cookie).get('/api/users')).status).toBe(200);

    expect((await boss.patch(`/api/users/${world.admin.user._id}/role`, { role: 'ADMIN' })).status).toBe(400);
    expect((await boss.patch(`/api/users/${world.admin.user._id}/status`, { status: 'DISABLED' })).status).toBe(400);
    expect((await boss.patch(`/api/users/${world.staff.user._id}/role`, { role: 'INSTALLER' })).status).toBe(400);

    const list = await boss.get('/api/users');
    expect(list.body.users.map((u: any) => u.role).sort()).toEqual(['ADMIN', 'SUPER_ADMIN', 'SUPER_ADMIN', 'SUPER_ADMIN']);
  });
});

describe('First super admin', () => {
  it('promotes the oldest office login when a database has none yet', async () => {
    const older = await createUser(UserRole.ADMIN, undefined, 'First Login');
    await new Promise((resolve) => setTimeout(resolve, 15));
    const newer = await createUser(UserRole.ADMIN, undefined, 'Second Login');

    await ensureFirstRunData();
    expect((await User.findById(older.user._id))!.role).toBe('SUPER_ADMIN');
    expect((await User.findById(newer.user._id))!.role).toBe('ADMIN');

    // Running again changes nothing.
    await ensureFirstRunData();
    expect(await User.countDocuments({ role: 'SUPER_ADMIN' })).toBe(1);
    expect(await User.countDocuments()).toBe(2);
  });
});
