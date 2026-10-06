import { getNextSequence } from '../models/Counter';

const PAD_LENGTH = 6;

/** SC-CMP-000001 - backed by an atomic counter, so numbers never repeat. */
export async function generateComplaintNumber(): Promise<string> {
  const seq = await getNextSequence('complaintNumber');
  return `SC-CMP-${String(seq).padStart(PAD_LENGTH, '0')}`;
}

export async function generateCustomerCode(): Promise<string> {
  const seq = await getNextSequence('customerCode');
  return `SC-CUS-${String(seq).padStart(PAD_LENGTH, '0')}`;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
