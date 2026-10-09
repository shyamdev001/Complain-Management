/** SUPER_ADMIN: full control. ADMIN: office staff doing the daily work. */
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'INSTALLER';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  installerId?: string;
  installerName?: string;
}

export type Priority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type ComplaintStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'VISIT_SCHEDULED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_PARTS'
  | 'RESOLVED_BY_INSTALLER'
  | 'CLOSED'
  | 'REOPENED';

export type PhotoKind = 'BEFORE' | 'AFTER';

export interface Installer {
  id: string;
  name: string;
  phone?: string;
  active: boolean;
}

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  address?: string;
  cityVillage?: string;
  projectId?: string;
  systemSizeKw?: number;
  installationDate?: string;
  installedBy?: string;
  inverter?: string;
  panels?: string;
  notes?: string;
  createdAt: string;
  openComplaints?: number;
}

export type CustomerInput = Partial<Omit<Customer, 'id' | 'customerCode' | 'createdAt' | 'openComplaints'>>;

export interface ComplaintListItem {
  id: string;
  complaintNumber: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerCode: string;
  projectId?: string;
  location: string;
  cityVillage?: string;
  category: string;
  description: string;
  priority: Priority;
  status: ComplaintStatus;
  installerId: string;
  installerName: string;
  createdAt: string;
  dueDate?: string;
  scheduledVisitAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  archived: boolean;
  reopenedCount: number;
  isOverdue: boolean;
}

export interface Part {
  name: string;
  quantity: number;
}

export interface Visit {
  at: string;
  technician?: string;
  note?: string;
  scheduledByName: string;
  scheduledAt: string;
}

export interface Photo {
  id: string;
  kind: PhotoKind;
  size: number;
  uploadedByName: string;
  uploadedAt: string;
}

export interface Resolution {
  diagnosis: string;
  actionTaken: string;
  partsUsed: Part[];
  notes?: string;
  photoIds: string[];
  installerName: string;
  resolvedByName: string;
  resolvedAt: string;
}

export interface TimelineEntry {
  _id: string;
  type: string;
  message: string;
  actorName: string;
  actorRole: string;
  visibility: 'ALL' | 'ADMIN';
  at: string;
}

export interface Complaint {
  id: string;
  complaintNumber: string;
  customer: string;
  customerSnapshot: {
    customerCode: string;
    name: string;
    mobile: string;
    address?: string;
    cityVillage?: string;
    projectId?: string;
    systemSizeKw?: number;
    installationDate?: string;
    inverter?: string;
    panels?: string;
  };
  category: string;
  categoryOther?: string;
  description: string;
  priority: Priority;
  assignedInstaller: string;
  assignedInstallerName: string;
  assignedAt: string;
  status: ComplaintStatus;
  createdByName: string;
  acceptedByName?: string;
  acceptedAt?: string;
  responseDueAt?: string;
  dueDate?: string;
  scheduledVisit?: Visit;
  visits: Visit[];
  diagnosis?: string;
  actionTaken?: string;
  partsUsed: Part[];
  serviceNotes?: string;
  photos: Photo[];
  resolutions: Resolution[];
  resolvedAt?: string;
  closedAt?: string;
  closedByName?: string;
  lastExportedAt?: string;
  reopenedCount: number;
  customerConfirmation?: {
    status: 'PENDING' | 'CONFIRMED' | 'NOT_RESOLVED';
    source?: 'OFFICE' | 'WHATSAPP';
    note?: string;
    recordedByName?: string;
    recordedAt?: string;
  };
  timeline: TimelineEntry[];
  archived: boolean;
  archiveReason?: string;
  createdAt: string;
  isOverdue: boolean;
  resolutionTimeHours: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface InstallerStats {
  id: string;
  name: string;
  active: boolean;
  total: number;
  open: number;
  resolved: number;
  closed: number;
  reopened: number;
  overdue: number;
  avgResolutionHours: number | null;
}

export interface ComplaintStats {
  total: number;
  open: number;
  overdue: number;
  byStatus: Record<ComplaintStatus, number>;
  installers?: InstallerStats[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
  installerId?: string;
  installerName?: string;
  createdAt: string;
}

export interface SlaTarget {
  responseHours: number;
  resolutionHours: number | null;
}
export type SlaConfig = Record<Priority, SlaTarget>;

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  complaintId: string;
  complaintNumber: string;
  createdAt: string;
  read: boolean;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  actorName: string;
  actorRole: string;
  targetLabel?: string;
  details?: string;
  createdAt: string;
}
