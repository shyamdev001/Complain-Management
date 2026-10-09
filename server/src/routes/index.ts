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
/** Anyone working in the office app. */
const office = [requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN)];
/** Editing or deleting existing records, logins, installers, settings and the audit log. */
const superAdmin = [requireAuth, requireRole(UserRole.SUPER_ADMIN)];
const id = { params: v.idParam };

router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);

// Authenticated by shared secret, not by session - see webhook.controller.ts
router.post('/webhooks/customer-confirmation', validate({ body: webhookConfirmationSchema }), customerConfirmationWebhook);

// Notifications
router.get('/notifications', requireAuth, admin.listNotifications);
router.post('/notifications/read-all', requireAuth, admin.markNotificationsRead);

router.get('/customers', office, validate({ query: v.listCustomersSchema }), customers.listCustomers);
router.post('/customers', office, validate({ body: v.createCustomerSchema }), customers.createCustomer);
router.get('/customers/:id', office, validate(id), customers.getCustomer);
router.patch('/customers/:id', superAdmin, validate({ ...id, body: v.updateCustomerSchema }), customers.updateCustomer);
router.delete('/customers/:id', superAdmin, validate(id), customers.deleteCustomer);

router.get('/installers', office, admin.listInstallers);
router.post('/installers', superAdmin, validate({ body: v.createInstallerSchema }), admin.createInstaller);
router.patch('/installers/:id', superAdmin, validate({ ...id, body: v.updateInstallerSchema }), admin.updateInstaller);

router.get('/users', superAdmin, admin.listUsers);
router.post('/users', superAdmin, validate({ body: v.createUserSchema }), admin.createUser);
router.patch('/users/:id', superAdmin, validate({ ...id, body: v.updateUserSchema }), admin.updateUser);
router.patch('/users/:id/status', superAdmin, validate({ ...id, body: v.updateUserStatusSchema }), admin.updateUserStatus);
router.patch('/users/:id/role', superAdmin, validate({ ...id, body: v.updateUserRoleSchema }), admin.updateUserRole);
router.post(
  '/users/:id/reset-credentials',
  superAdmin,
  validate({ ...id, body: v.resetCredentialsSchema }),
  admin.resetUserCredentials,
);

router.get('/settings/sla', superAdmin, admin.getSlaSettings);
router.put('/settings/sla', superAdmin, validate({ body: v.slaSchema }), admin.updateSlaSettings);

router.get('/audit-logs', superAdmin, validate({ query: v.pageSchema }), admin.listAuditLogs);

export default router;
