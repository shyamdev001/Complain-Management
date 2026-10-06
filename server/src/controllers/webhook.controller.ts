import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { Complaint } from '../models/Complaint';
import { AuditAction, ConfirmationStatus } from '../types/enums';
import { recordAudit } from '../services/audit.service';
import { applyCustomerConfirmation } from '../services/complaint.service';

function secretMatches(provided: unknown): boolean {
  if (typeof provided !== 'string' || !env.webhookSecret) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the n8n/WhatsApp workflow when the customer taps
 * "Issue Resolved" or "Issue Still Exists". There is no user session here, so
 * the request is authenticated with the shared WEBHOOK_SECRET; the endpoint
 * is disabled entirely until that secret is configured.
 */
export const customerConfirmationWebhook = catchAsync(async (req: Request, res: Response) => {
  if (!env.webhookSecret) throw new ApiError(503, 'WhatsApp confirmation webhook is not configured');
  if (!secretMatches(req.headers['x-webhook-secret'])) throw ApiError.unauthorized('Invalid webhook secret');

  const { complaintNumber, response, note } = req.body;
  const complaint = await Complaint.findOne({ complaintNumber: complaintNumber.toUpperCase(), archived: false });
  if (!complaint) throw ApiError.notFound('Complaint not found');

  const actor = { name: `${complaint.customerSnapshot.name} (customer)`, role: 'CUSTOMER' };
  await applyCustomerConfirmation(
    complaint,
    response === 'RESOLVED' ? ConfirmationStatus.CONFIRMED : ConfirmationStatus.NOT_RESOLVED,
    'WHATSAPP',
    actor,
    note,
  );
  await recordAudit({
    action: AuditAction.COMPLAINT_CONFIRMATION,
    actor: { id: String(complaint.createdBy), name: actor.name, role: actor.role },
    targetType: 'Complaint',
    targetId: complaint._id.toString(),
    targetLabel: complaint.complaintNumber,
    details: `WhatsApp: ${response}`,
    req,
  });

  res.json({ success: true, complaintNumber: complaint.complaintNumber, status: complaint.status });
});
