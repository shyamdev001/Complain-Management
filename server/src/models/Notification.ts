import { Schema, model, Document, Types } from 'mongoose';
import { NotificationType } from '../types/enums';

export interface INotification extends Document {
  _id: Types.ObjectId;
  /** ADMIN = every office/admin user; INSTALLER = every user of `installer`. */
  audience: 'ADMIN' | 'INSTALLER';
  installer?: Types.ObjectId;
  type: NotificationType;
  message: string;
  complaint: Types.ObjectId;
  complaintNumber: string;
  readBy: Types.ObjectId[];
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    audience: { type: String, enum: ['ADMIN', 'INSTALLER'], required: true },
    installer: { type: Schema.Types.ObjectId, ref: 'Installer' },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    message: { type: String, required: true, maxlength: 300 },
    complaint: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true },
    complaintNumber: { type: String, required: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ audience: 1, installer: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);
