import { z } from 'zod';
import { Priority, UserRole, UserStatus } from '../types/enums';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const mobile = z.string().trim().regex(/^[0-9]{10}$/, 'Enter a 10-digit mobile number');
const optionalText = (max: number) => z.string().trim().max(max).optional();
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/* ---- Customers ---- */
const customerFields = {
  name: z.string().trim().min(2, 'Name is required').max(120),
  mobile,
  alternateMobile: z.union([mobile, z.literal('')]).optional(),
  address: optionalText(300),
  cityVillage: optionalText(80),
  projectId: optionalText(40),
  systemSizeKw: z.coerce.number().min(0).max(100000).optional(),
  installationDate: z.coerce.date().optional(),
  installedBy: optionalText(120),
  inverter: optionalText(120),
  panels: optionalText(120),
  notes: optionalText(1000),
};
export const createCustomerSchema = z.object(customerFields);
export const updateCustomerSchema = z.object(customerFields).partial();
export const listCustomersSchema = z.object({
  q: optionalText(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/* ---- Users ---- */
const officeRole = z.enum([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.union([mobile, z.literal('')]).optional(),
  role: officeRole.default(UserRole.ADMIN),
  password,
});
export const updateUserRoleSchema = z.object({ role: officeRole });
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.union([mobile, z.literal('')]).optional(),
});
export const updateUserStatusSchema = z.object({ status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED]) });
export const resetCredentialsSchema = z.object({ newPassword: password });

/* ---- Installers ---- */
export const createInstallerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: z.union([mobile, z.literal('')]).optional(),
});
export const updateInstallerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.union([mobile, z.literal('')]).optional(),
  active: z.boolean().optional(),
});

/* ---- SLA settings ---- */
const slaTarget = z.object({
  responseHours: z.coerce.number().min(0.25, 'Must be at least 15 minutes').max(8760),
  resolutionHours: z.union([z.coerce.number().min(0.25).max(8760), z.null()]),
});
export const slaSchema = z.object({
  sla: z.object({
    [Priority.CRITICAL]: slaTarget,
    [Priority.HIGH]: slaTarget,
    [Priority.NORMAL]: slaTarget,
    [Priority.LOW]: slaTarget,
  }),
});

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParam = z.object({ id: objectId });
