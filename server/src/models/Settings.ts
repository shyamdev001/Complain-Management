import { Schema, model } from 'mongoose';
import { Priority } from '../types/enums';

export interface SlaTarget {
  /** Hours the installer has to accept/respond. */
  responseHours: number;
  /** Hours until the complaint should be resolved. null = no resolution target. */
  resolutionHours: number | null;
}

export type SlaConfig = Record<Priority, SlaTarget>;

export const DEFAULT_SLA: SlaConfig = {
  CRITICAL: { responseHours: 2, resolutionHours: 12 },
  HIGH: { responseHours: 4, resolutionHours: 24 },
  NORMAL: { responseHours: 24, resolutionHours: 48 },
  LOW: { responseHours: 48, resolutionHours: null },
};

export interface ISettings {
  _id: string;
  sla: SlaConfig;
  updatedByName?: string;
  updatedAt?: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    _id: { type: String, required: true },
    sla: { type: Schema.Types.Mixed, required: true },
    updatedByName: { type: String },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const Settings = model<ISettings>('Settings', settingsSchema);
