import { Complaint } from '../models/Complaint';
import { NotificationType, TimelineEvent } from '../types/enums';
import { SYSTEM_ACTOR, addTimeline } from './complaint.service';
import { notify } from './notification.service';
import { overdueFilter } from './sla.service';

/**
 * Finds complaints that have just crossed a deadline and, once per overdue
 * period, records it on the timeline and notifies the installer and the
 * office. `overdueNotifiedAt` is cleared on reopen/reassign so a fresh
 * deadline can raise a fresh alert.
 */
export async function runOverdueSweep(): Promise<number> {
  const complaints = await Complaint.find({ ...overdueFilter(), overdueNotifiedAt: { $exists: false } }).limit(200);
  for (const complaint of complaints) {
    complaint.overdueNotifiedAt = new Date();
    addTimeline(complaint, TimelineEvent.OVERDUE, 'Complaint passed its target deadline', SYSTEM_ACTOR);
    await complaint.save();
    await notify({
      type: NotificationType.COMPLAINT_OVERDUE,
      complaint,
      message: `${complaint.complaintNumber} (${complaint.customerSnapshot.name}) is overdue`,
      audiences: ['ADMIN', { installerId: complaint.assignedInstaller }],
    });
  }
  return complaints.length;
}

export function startOverdueSweep(intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  const tick = () => runOverdueSweep().catch((err) => console.error('[overdue] sweep failed:', err.message));
  tick();
  return setInterval(tick, intervalMs);
}
