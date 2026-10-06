import { Schema, model, Document, Types } from 'mongoose';

export interface IInstaller extends Document {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const installerSchema = new Schema<IInstaller>(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Installer = model<IInstaller>('Installer', installerSchema);
