import { Router } from 'express';
import authRoutes from './auth.routes';
import complaintRoutes from './complaint.routes';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { UserRole } from '../types/enums';
import * as v from '../validators/admin.validators';
import { webhookConfirmationSchema } from '../validators/complaint.validators';
import * as customers from '../controllers/customer.controller';
import * as admin from '../controllers/admin.controller';
import { customerConfirmationWebhook } from '../controllers/webhook.controller';

const router = Router();
const adminOnly = [requireAuth, requireRole(UserRole.ADMIN)];
const id = { params: v.idParam };

router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);

// Authenticated by shared secret, not by session - see webhook.controller.ts
router.post('/webhooks/customer-confirmation', validate({ body: webhookConfirmationSchema }), customerConfirmationWebhook);

// Notifications: both roles, each scoped to their own audience
router.get('/notifications', requireAuth, admin.listNotifications);
router.post('/notifications/read-all', requireAuth, admin.markNotificationsRead);

// Everything below is office/admin only. Installers get customer details
// solely through the snapshot on complaints assigned to them.
router.get('/customers', adminOnly, validate({ query: v.listCustomersSchema }), customers.listCustomers);
router.post('/customers', adminOnly, validate({ body: v.createCustomerSchema }), customers.createCustomer);
router.get('/customers/:id', adminOnly, validate(id), customers.getCustomer);
router.patch('/customers/:id', adminOnly, validate({ ...id, body: v.updateCustomerSchema }), customers.updateCustomer);

router.get('/installers', adminOnly, admin.listInstallers);
router.post('/installers', adminOnly, validate({ body: v.createInstallerSchema }), admin.createInstaller);
router.patch('/installers/:id', adminOnly, validate({ ...id, body: v.updateInstallerSchema }), admin.updateInstaller);

router.get('/users', adminOnly, admin.listUsers);
router.post('/users', adminOnly, validate({ body: v.createUserSchema }), admin.createUser);
router.patch('/users/:id', adminOnly, validate({ ...id, body: v.updateUserSchema }), admin.updateUser);
router.patch('/users/:id/status', adminOnly, validate({ ...id, body: v.updateUserStatusSchema }), admin.updateUserStatus);
router.post(
  '/users/:id/reset-credentials',
  adminOnly,
  validate({ ...id, body: v.resetCredentialsSchema }),
  admin.resetUserCredentials,
);

router.get('/settings/sla', adminOnly, admin.getSlaSettings);
router.put('/settings/sla', adminOnly, validate({ body: v.slaSchema }), admin.updateSlaSettings);

router.get('/audit-logs', adminOnly, validate({ query: v.pageSchema }), admin.listAuditLogs);

export default router;
