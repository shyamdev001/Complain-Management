export const UserRole = {
  /** Full control: also edits and deletes records, manages logins, installers and settings. */
  SUPER_ADMIN: 'SUPER_ADMIN',
  /** Office staff: the daily work - complaints, customers, Excel sheets. */
  ADMIN: 'ADMIN',
  /** Legacy: installers no longer sign in. */
  INSTALLER: 'INSTALLER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Anyone who works in the office app - staff or super admin. */
export const OFFICE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
export const isOffice = (role: UserRole): boolean => OFFICE_ROLES.includes(role);

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ComplaintCategory = {
  GENERATION: 'Solar generation issue',
  INVERTER: 'Inverter issue',
  PANEL: 'Panel issue',
  WIRING: 'Wiring issue',
  EARTHING: 'Earthing issue',
  MONITORING: 'Monitoring/app issue',
  PHYSICAL_DAMAGE: 'Physical damage',
  WATER_LEAKAGE: 'Water leakage',
  ELECTRICAL: 'Electrical issue',
  BILLING: 'Electricity/billing issue',
  SUBSIDY: 'Portal/subsidy issue',
  INSTALLATION_QUALITY: 'Installation quality issue',
  OTHER: 'Other',
} as const;
export type ComplaintCategory = (typeof ComplaintCategory)[keyof typeof ComplaintCategory];

export const Priority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const ComplaintStatus = {
  NEW: 'NEW',
  ACCEPTED: 'ACCEPTED',
  VISIT_SCHEDULED: 'VISIT_SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_FOR_PARTS: 'WAITING_FOR_PARTS',
  RESOLVED_BY_INSTALLER: 'RESOLVED_BY_INSTALLER',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
} as const;
export type ComplaintStatus = (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

/** Statuses where the installer still owes work - the only ones that can be overdue. */
export const OPEN_STATUSES: ComplaintStatus[] = [
  ComplaintStatus.NEW,
  ComplaintStatus.ACCEPTED,
  ComplaintStatus.VISIT_SCHEDULED,
  ComplaintStatus.IN_PROGRESS,
  ComplaintStatus.WAITING_FOR_PARTS,
  ComplaintStatus.REOPENED,
];

/** Statuses still waiting on the first response from the installer. */
export const AWAITING_RESPONSE_STATUSES: ComplaintStatus[] = [ComplaintStatus.NEW, ComplaintStatus.REOPENED];

export const PhotoKind = {
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
} as const;
export type PhotoKind = (typeof PhotoKind)[keyof typeof PhotoKind];

export const ConfirmationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  NOT_RESOLVED: 'NOT_RESOLVED',
} as const;
export type ConfirmationStatus = (typeof ConfirmationStatus)[keyof typeof ConfirmationStatus];

export const TimelineEvent = {
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  REASSIGNED: 'REASSIGNED',
  UPDATED: 'UPDATED',
  ACCEPTED: 'ACCEPTED',
  VISIT_SCHEDULED: 'VISIT_SCHEDULED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SERVICE_REPORT_UPDATED: 'SERVICE_REPORT_UPDATED',
  PHOTOS_UPLOADED: 'PHOTOS_UPLOADED',
  SHEET_EXPORTED: 'SHEET_EXPORTED',
  NOTE: 'NOTE',
  INTERNAL_NOTE: 'INTERNAL_NOTE',
  RESOLVED: 'RESOLVED',
  CONFIRMATION_REQUESTED: 'CONFIRMATION_REQUESTED',
  CUSTOMER_CONFIRMED: 'CUSTOMER_CONFIRMED',
  CUSTOMER_NOT_RESOLVED: 'CUSTOMER_NOT_RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
  OVERDUE: 'OVERDUE',
  ARCHIVED: 'ARCHIVED',
  RESTORED: 'RESTORED',
} as const;
export type TimelineEvent = (typeof TimelineEvent)[keyof typeof TimelineEvent];

export const NotificationType = {
  COMPLAINT_ASSIGNED: 'COMPLAINT_ASSIGNED',
  COMPLAINT_UNASSIGNED: 'COMPLAINT_UNASSIGNED',
  COMPLAINT_ACCEPTED: 'COMPLAINT_ACCEPTED',
  VISIT_SCHEDULED: 'VISIT_SCHEDULED',
  COMPLAINT_RESOLVED: 'COMPLAINT_RESOLVED',
  COMPLAINT_REOPENED: 'COMPLAINT_REOPENED',
  COMPLAINT_CLOSED: 'COMPLAINT_CLOSED',
  COMPLAINT_OVERDUE: 'COMPLAINT_OVERDUE',
  CUSTOMER_CONFIRMATION: 'CUSTOMER_CONFIRMATION',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  COMPLAINT_CREATED: 'COMPLAINT_CREATED',
  COMPLAINT_UPDATED: 'COMPLAINT_UPDATED',
  COMPLAINT_REASSIGNED: 'COMPLAINT_REASSIGNED',
  COMPLAINT_ACCEPTED: 'COMPLAINT_ACCEPTED',
  COMPLAINT_VISIT_SCHEDULED: 'COMPLAINT_VISIT_SCHEDULED',
  COMPLAINT_STATUS_CHANGED: 'COMPLAINT_STATUS_CHANGED',
  COMPLAINT_SERVICE_REPORT: 'COMPLAINT_SERVICE_REPORT',
  COMPLAINT_PHOTOS_UPLOADED: 'COMPLAINT_PHOTOS_UPLOADED',
  COMPLAINT_NOTE_ADDED: 'COMPLAINT_NOTE_ADDED',
  COMPLAINT_RESOLVED: 'COMPLAINT_RESOLVED',
  COMPLAINT_CONFIRMATION: 'COMPLAINT_CONFIRMATION',
  COMPLAINT_CLOSED: 'COMPLAINT_CLOSED',
  COMPLAINT_REOPENED: 'COMPLAINT_REOPENED',
  COMPLAINT_ARCHIVED: 'COMPLAINT_ARCHIVED',
  COMPLAINT_RESTORED: 'COMPLAINT_RESTORED',
  COMPLAINT_DELETED: 'COMPLAINT_DELETED',
  COMPLAINTS_EXPORTED: 'COMPLAINTS_EXPORTED',
  COMPLAINTS_IMPORTED: 'COMPLAINTS_IMPORTED',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER_DELETED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  USER_CREDENTIALS_RESET: 'USER_CREDENTIALS_RESET',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  INSTALLER_CREATED: 'INSTALLER_CREATED',
  INSTALLER_UPDATED: 'INSTALLER_UPDATED',
  SLA_UPDATED: 'SLA_UPDATED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
