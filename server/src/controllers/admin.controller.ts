import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { Installer } from '../models/Installer';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { AuditAction, OFFICE_ROLES, UserRole, UserStatus, isOffice } from '../types/enums';
import { recordAudit } from '../services/audit.service';
import { actorOf } from '../services/complaint.service';
import { getSla, saveSla } from '../services/sla.service';

/* ------------------------------------------------------------------ */
/* Installers (companies)                                              */
/* ------------------------------------------------------------------ */

export const listInstallers = catchAsync(async (_req: Request, res: Response) => {
  const installers = await Installer.find().sort({ name: 1 }).lean();
  res.json({
    installers: installers.map((i) => ({ id: String(i._id), name: i.name, phone: i.phone, active: i.active })),
  });
});

export const createInstaller = catchAsync(async (req: Request, res: Response) => {
  const existing = await Installer.findOne({ name: new RegExp(`^${req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (existing) throw ApiError.conflict('An installer with this name already exists');
  const installer = await Installer.create({ name: req.body.name, phone: req.body.phone || undefined });
  await recordAudit({
    action: AuditAction.INSTALLER_CREATED,
    actor: actorOf(req),
    targetType: 'Installer',
    targetId: installer._id.toString(),
    targetLabel: installer.name,
    req,
  });
  res.status(201).json({ installer: { id: String(installer._id), name: installer.name, phone: installer.phone, active: installer.active } });
});

export const updateInstaller = catchAsync(async (req: Request, res: Response) => {
  const installer = await Installer.findById(req.params.id);
  if (!installer) throw ApiError.notFound('Installer not found');
  if (req.body.name !== undefined) installer.name = req.body.name;
  if (req.body.phone !== undefined) installer.phone = req.body.phone || undefined;
  if (req.body.active !== undefined) installer.active = req.body.active;
  await installer.save();
  await recordAudit({
    action: AuditAction.INSTALLER_UPDATED,
    actor: actorOf(req),
    targetType: 'Installer',
    targetId: installer._id.toString(),
    targetLabel: installer.name,
    details: req.body.active === false ? 'Deactivated' : undefined,
    req,
  });
  res.json({ installer: { id: String(installer._id), name: installer.name, phone: installer.phone, active: installer.active } });
});

/* ------------------------------------------------------------------ */
/* User accounts                                                       */
/* ------------------------------------------------------------------ */

function serializeUser(u: any) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    installerId: u.installer ? String(u.installer._id ?? u.installer) : undefined,
    installerName: u.installer?.name,
    createdAt: u.createdAt,
  };
}

export const listUsers = catchAsync(async (_req: Request, res: Response) => {
  const users = await User.find({ role: { $in: OFFICE_ROLES } }).sort({ createdAt: 1 }).lean();
  res.json({ users: users.map(serializeUser) });
});

export const createUser = catchAsync(async (req: Request, res: Response) => {
  const { name, email, phone, password, role } = req.body;

  if (await User.findOne({ email })) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({
    name,
    email,
    phone: phone || undefined,
    role,
    passwordHash: await bcrypt.hash(password, 12),
  });

  await recordAudit({
    action: AuditAction.USER_CREATED,
    actor: actorOf(req),
    targetType: 'User',
    targetId: user._id.toString(),
    targetLabel: user.name,
    details: role === UserRole.SUPER_ADMIN ? 'Super admin' : 'Office staff',
    req,
  });

  res.status(201).json({ user: serializeUser(user.toObject()) });
});

export const updateUser = catchAsync(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).populate('installer', 'name');
  if (!user) throw ApiError.notFound('User not found');
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone || undefined;
  await user.save();
  await recordAudit({
    action: AuditAction.USER_UPDATED,
    actor: actorOf(req),
    targetType: 'User',
    targetId: user._id.toString(),
    targetLabel: user.name,
    req,
  });
  res.json({ user: serializeUser(user.toObject()) });
});

export const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('+refreshTokenVersion');
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === req.user!.id) throw ApiError.badRequest('You cannot disable your own account');

  user.status = req.body.status;
  if (user.status === UserStatus.DISABLED) user.refreshTokenVersion += 1; // force logout everywhere
  await user.save();

  await recordAudit({
    action: user.status === UserStatus.DISABLED ? AuditAction.USER_DISABLED : AuditAction.USER_ENABLED,
    actor: actorOf(req),
    targetType: 'User',
    targetId: user._id.toString(),
    targetLabel: user.name,
    req,
  });
  res.json({ user: { id: String(user._id), status: user.status } });
});

/**
 * Makes someone a super admin or office staff. Nobody can change their own
 * role (or disable themselves), so there is always at least one super admin.
 */
export const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user || !OFFICE_ROLES.includes(user.role)) throw ApiError.notFound('User not found');
  if (String(user._id) === req.user!.id) throw ApiError.badRequest('You cannot change your own role');

  const from = user.role;
  user.role = req.body.role;
  await user.save();
  await recordAudit({
    action: AuditAction.USER_ROLE_CHANGED,
    actor: actorOf(req),
    targetType: 'User',
    targetId: user._id.toString(),
    targetLabel: user.name,
    details: `${from} -> ${user.role}`,
    req,
  });
  res.json({ user: serializeUser(user.toObject()) });
});

export const resetUserCredentials = catchAsync(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('+refreshTokenVersion');
  if (!user) throw ApiError.notFound('User not found');

  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.refreshTokenVersion += 1;
  await user.save();

  await recordAudit({
    action: AuditAction.USER_CREDENTIALS_RESET,
    actor: actorOf(req),
    targetType: 'User',
    targetId: user._id.toString(),
    targetLabel: user.name,
    req,
  });
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* SLA settings                                                        */
/* ------------------------------------------------------------------ */

export const getSlaSettings = catchAsync(async (_req: Request, res: Response) => {
  res.json({ sla: await getSla() });
});

export const updateSlaSettings = catchAsync(async (req: Request, res: Response) => {
  const sla = await saveSla(req.body.sla, req.user!.name);
  await recordAudit({
    action: AuditAction.SLA_UPDATED,
    actor: actorOf(req),
    targetType: 'Settings',
    details: Object.entries(req.body.sla)
      .map(([p, t]: [string, any]) => `${p} ${t.responseHours}h/${t.resolutionHours ?? '-'}h`)
      .join(', '),
    req,
  });
  res.json({ sla });
});

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export const listAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const { page, limit } = req.query as any;
  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(),
    AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  res.json({ logs, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});

/* ------------------------------------------------------------------ */
/* In-app notifications (both roles, scoped to the caller's audience)   */
/* ------------------------------------------------------------------ */

function audienceFilter(req: Request) {
  return isOffice(req.user!.role)
    ? { audience: 'ADMIN' }
    : { audience: 'INSTALLER', installer: req.user!.installerId };
}

export const listNotifications = catchAsync(async (req: Request, res: Response) => {
  const filter = audienceFilter(req);
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ ...filter, readBy: { $ne: req.user!.id } }),
  ]);
  res.json({
    unread,
    notifications: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      message: n.message,
      complaintId: String(n.complaint),
      complaintNumber: n.complaintNumber,
      createdAt: n.createdAt,
      read: n.readBy.some((id) => String(id) === req.user!.id),
    })),
  });
});

export const markNotificationsRead = catchAsync(async (req: Request, res: Response) => {
  await Notification.updateMany(
    { ...audienceFilter(req), readBy: { $ne: req.user!.id } },
    { $addToSet: { readBy: req.user!.id } },
  );
  res.json({ success: true });
});
