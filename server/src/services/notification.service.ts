import { Types } from 'mongoose';
import { env } from '../config/env';
import { IComplaint } from '../models/Complaint';
import { Notification } from '../models/Notification';
import { NotificationType } from '../types/enums';

const IN_APP_TYPES: NotificationType[] = [NotificationType.COMPLAINT_OVERDUE, NotificationType.CUSTOMER_CONFIRMATION];

type Audience = 'ADMIN' | { installerId: Types.ObjectId | string };

interface NotifyParams {
  type: NotificationType;
  complaint: IComplaint;
  message: string;
  /** Who sees this in the app. */
  audiences: Audience[];
}

/**
 * Single entry point for every complaint notification.
 *
 * 1. In-app: one Notification row per audience (office, or one installer
 *    company) - shown in the bell menu.
 * 2. Outbound: when N8N_WEBHOOK_URL is set, the same event is POSTed there as
 *    JSON so an n8n workflow can send WhatsApp messages (installer alert,
 *    customer visit notice, customer "is it resolved?" buttons). The customer
 *    reply comes back through POST /api/webhooks/customer-confirmation.
 *
 * Never throws - a notification failure must not fail the action that caused it.
 */
export async function notify({ type, complaint, message, audiences }: NotifyParams): Promise<void> {
  // The office performs every step itself, so only events it did not trigger
  // (a deadline passing, a customer replying on WhatsApp) are worth a bell
  // notification. Every event is still sent to the n8n webhook below.
  const inApp = IN_APP_TYPES.includes(type) ? audiences.filter((a) => a === 'ADMIN') : [];
  try {
    await Notification.insertMany(
      inApp.map(() => ({
        audience: 'ADMIN',
        type,
        message,
        complaint: complaint._id,
        complaintNumber: complaint.complaintNumber,
      })),
    );
  } catch (err) {
    console.error('[notify] failed to store notification:', (err as Error).message);
  }

  if (!env.n8nWebhookUrl || env.nodeEnv === 'test') return;

  const payload = {
    event: type,
    message,
    complaintId: String(complaint._id),
    complaintNumber: complaint.complaintNumber,
    status: complaint.status,
    priority: complaint.priority,
    category: complaint.category,
    description: complaint.description,
    installer: { id: String(complaint.assignedInstaller), name: complaint.assignedInstallerName },
    customer: {
      name: complaint.customerSnapshot.name,
      mobile: complaint.customerSnapshot.mobile,
      cityVillage: complaint.customerSnapshot.cityVillage,
    },
    scheduledVisit: complaint.scheduledVisit ?? null,
    dueDate: complaint.dueDate ?? null,
    confirmationCallbackUrl: `${env.serverUrl}/api/webhooks/customer-confirmation`,
    sentAt: new Date().toISOString(),
  };

  fetch(env.n8nWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': env.webhookSecret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch((err) => console.error('[notify] webhook delivery failed:', (err as Error).message));
}
