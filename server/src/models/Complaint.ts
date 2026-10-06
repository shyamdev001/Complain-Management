import { Schema, model, Document, Types } from 'mongoose';
import {
  ComplaintCategory,
  ComplaintStatus,
  ConfirmationStatus,
  PhotoKind,
  Priority,
  TimelineEvent,
} from '../types/enums';

export interface ITimelineEntry {
  _id?: Types.ObjectId;
  type: TimelineEvent;
  message: string;
  actorId?: Types.ObjectId | string;
  actorName: string;
  actorRole: string;
  /** ADMIN entries (internal notes) are never sent to installers. */
  visibility: 'ALL' | 'ADMIN';
  at: Date;
}

export interface IPart {
  name: string;
  quantity: number;
}

export interface IPhoto {
  _id: Types.ObjectId;
  kind: PhotoKind;
  storage: 'local' | 'cloudinary';
  key: string;
  mimeType: string;
  size: number;
  uploadedBy: Types.ObjectId;
  uploadedByName: string;
  uploadedAt: Date;
}

export interface IVisit {
  at: Date;
  technician?: string;
  note?: string;
  scheduledByName: string;
  scheduledAt: Date;
}

export interface IResolution {
  diagnosis: string;
  actionTaken: string;
  partsUsed: IPart[];
  notes?: string;
  photoIds: Types.ObjectId[];
  installerName: string;
  resolvedBy: Types.ObjectId;
  resolvedByName: string;
  resolvedAt: Date;
}

export interface ICustomerSnapshot {
  customerCode: string;
  name: string;
  mobile: string;
  address?: string;
  cityVillage?: string;
  projectId?: string;
  systemSizeKw?: number;
  installationDate?: Date;
  inverter?: string;
  panels?: string;
}

export interface IComplaint extends Document {
  _id: Types.ObjectId;
  complaintNumber: string;
  customer: Types.ObjectId;
  /** Copy of the customer's details at creation - keeps the ticket readable and searchable even if the customer record is edited later. */
  customerSnapshot: ICustomerSnapshot;
  category: ComplaintCategory;
  categoryOther?: string;
  description: string;
  priority: Priority;
  /** Always chosen manually by the office - never derived from customer/project data. */
  assignedInstaller: Types.ObjectId;
  assignedInstallerName: string;
  assignedAt: Date;
  status: ComplaintStatus;
  createdBy: Types.ObjectId;
  createdByName: string;
  acceptedBy?: Types.ObjectId;
  acceptedByName?: string;
  acceptedAt?: Date;
  responseDueAt?: Date;
  dueDate?: Date;
  scheduledVisit?: IVisit;
  visits: IVisit[];
  diagnosis?: string;
  actionTaken?: string;
  partsUsed: IPart[];
  serviceNotes?: string;
  photos: IPhoto[];
  /** One entry per "Mark as Resolved" - earlier resolutions survive a reopen. */
  resolutions: IResolution[];
  resolvedAt?: Date;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  closedByName?: string;
  reopenedCount: number;
  customerConfirmation?: {
    status: ConfirmationStatus;
    source?: 'OFFICE' | 'WHATSAPP';
    note?: string;
    recordedByName?: string;
    requestedAt?: Date;
    recordedAt?: Date;
  };
  timeline: ITimelineEntry[];
  overdueNotifiedAt?: Date;
  /** Last time this complaint was included in an Excel sheet downloaded for the installer. */
  lastExportedAt?: Date;
  archived: boolean;
  archivedAt?: Date;
  archivedByName?: string;
  archiveReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const partSchema = new Schema<IPart>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, default: 1, min: 0 },
  },
  { _id: false },
);

const visitSchema = new Schema<IVisit>(
  {
    at: { type: Date, required: true },
    technician: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 },
    scheduledByName: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
  },
  { _id: false },
);

const complaintSchema = new Schema<IComplaint>(
  {
    complaintNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerSnapshot: {
      customerCode: { type: String, required: true },
      name: { type: String, required: true },
      mobile: { type: String, required: true },
      address: String,
      cityVillage: String,
      projectId: String,
      systemSizeKw: Number,
      installationDate: Date,
      inverter: String,
      panels: String,
    },
    category: { type: String, enum: Object.values(ComplaintCategory), required: true },
    categoryOther: { type: String, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    priority: { type: String, enum: Object.values(Priority), required: true, default: Priority.NORMAL },
    assignedInstaller: { type: Schema.Types.ObjectId, ref: 'Installer', required: true },
    assignedInstallerName: { type: String, required: true },
    assignedAt: { type: Date, required: true },
    status: { type: String, enum: Object.values(ComplaintStatus), required: true, default: ComplaintStatus.NEW },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedByName: String,
    acceptedAt: Date,
    responseDueAt: Date,
    dueDate: Date,
    scheduledVisit: visitSchema,
    visits: [visitSchema],
    diagnosis: { type: String, trim: true, maxlength: 2000 },
    actionTaken: { type: String, trim: true, maxlength: 2000 },
    partsUsed: [partSchema],
    serviceNotes: { type: String, trim: true, maxlength: 2000 },
    photos: [
      {
        kind: { type: String, enum: Object.values(PhotoKind), required: true },
        storage: { type: String, enum: ['local', 'cloudinary'], required: true },
        key: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        uploadedByName: { type: String, required: true },
        uploadedAt: { type: Date, required: true },
      },
    ],
    resolutions: [
      {
        _id: false,
        diagnosis: String,
        actionTaken: String,
        partsUsed: [partSchema],
        notes: String,
        photoIds: [Schema.Types.ObjectId],
        installerName: String,
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        resolvedByName: String,
        resolvedAt: Date,
      },
    ],
    resolvedAt: Date,
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedByName: String,
    reopenedCount: { type: Number, default: 0 },
    customerConfirmation: {
      status: { type: String, enum: Object.values(ConfirmationStatus) },
      source: { type: String, enum: ['OFFICE', 'WHATSAPP'] },
      note: { type: String, maxlength: 500 },
      recordedByName: String,
      requestedAt: Date,
      recordedAt: Date,
    },
    timeline: [
      {
        type: { type: String, enum: Object.values(TimelineEvent), required: true },
        message: { type: String, required: true, maxlength: 2200 },
        actorId: { type: Schema.Types.ObjectId, ref: 'User' },
        actorName: { type: String, required: true },
        actorRole: { type: String, required: true },
        visibility: { type: String, enum: ['ALL', 'ADMIN'], default: 'ALL' },
        at: { type: Date, required: true },
      },
    ],
    overdueNotifiedAt: Date,
    lastExportedAt: Date,
    archived: { type: Boolean, default: false },
    archivedAt: Date,
    archivedByName: String,
    archiveReason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

complaintSchema.index({ assignedInstaller: 1, status: 1 });
complaintSchema.index({ customer: 1, createdAt: -1 });
complaintSchema.index({ status: 1, dueDate: 1 });
complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ 'customerSnapshot.mobile': 1 });
complaintSchema.index({ archived: 1 });

export const Complaint = model<IComplaint>('Complaint', complaintSchema);
