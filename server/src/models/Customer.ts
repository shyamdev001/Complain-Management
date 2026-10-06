import { Schema, model, Document, Types } from 'mongoose';

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  customerCode: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  address?: string;
  cityVillage?: string;
  projectId?: string;
  systemSizeKw?: number;
  installationDate?: Date;
  /** Reference information only - never used to pick a complaint's installer. */
  installedBy?: string;
  inverter?: string;
  panels?: string;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    customerCode: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    mobile: { type: String, required: true, trim: true, match: [/^[0-9]{10}$/, 'Mobile must be a 10-digit number'] },
    alternateMobile: { type: String, trim: true },
    address: { type: String, trim: true, maxlength: 300 },
    cityVillage: { type: String, trim: true, maxlength: 80 },
    projectId: { type: String, trim: true, maxlength: 40 },
    systemSizeKw: { type: Number, min: 0 },
    installationDate: { type: Date },
    installedBy: { type: String, trim: true, maxlength: 120 },
    inverter: { type: String, trim: true, maxlength: 120 },
    panels: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

customerSchema.index({ mobile: 1 });
customerSchema.index({ name: 1 });
customerSchema.index({ projectId: 1 });
customerSchema.index({ cityVillage: 1 });

export const Customer = model<ICustomer>('Customer', customerSchema);
