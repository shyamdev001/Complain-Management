import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { photoUpload, sheetUpload, MAX_PHOTOS_PER_UPLOAD } from '../middleware/upload.middleware';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import { UserRole } from '../types/enums';
import * as v from '../validators/complaint.validators';
import * as c from '../controllers/complaint.controller';

const router = Router();
const id = { params: v.idParamSchema };

// The office does everything. Installers have no login: they receive an Excel
// sheet (GET /export) and the office records what they report back.
// Office staff do the daily work; changing or removing what is already recorded is for the super admin.
router.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));
const superOnly = requireRole(UserRole.SUPER_ADMIN);

router.get('/', validate({ query: v.listComplaintsSchema }), c.listComplaints);
router.get('/stats', c.getStats);
router.get('/export', validate({ query: v.exportSchema }), c.exportSheet);
router.post('/import', uploadLimiter, sheetUpload.single('file'), validate({ query: v.importSchema }), c.importSheet);
router.post('/', validate({ body: v.createComplaintSchema }), c.createComplaint);
router.get('/:id', validate(id), c.getComplaint);

// Office decisions
router.patch('/:id', superOnly, validate({ ...id, body: v.updateComplaintSchema }), c.updateComplaint);
router.delete('/:id', superOnly, validate(id), c.deleteComplaint);
router.post('/:id/reassign', validate({ ...id, body: v.reassignSchema }), c.reassignComplaint);
router.post('/:id/customer-confirmation', validate({ ...id, body: v.confirmationSchema }), c.recordConfirmation);
router.post('/:id/close', validate({ ...id, body: v.closeSchema }), c.closeComplaint);
router.post('/:id/reopen', validate({ ...id, body: v.reopenSchema }), c.reopen);
router.post('/:id/archive', superOnly, validate({ ...id, body: v.archiveSchema }), c.archiveComplaint);
router.post('/:id/restore', superOnly, validate(id), c.restoreComplaint);

// Recording the installer's progress (told to the office by phone or on the returned sheet)
router.post('/:id/accept', validate(id), c.acceptComplaint);
router.post('/:id/schedule', validate({ ...id, body: v.scheduleVisitSchema }), c.scheduleVisit);
router.post('/:id/status', validate({ ...id, body: v.updateStatusSchema }), c.updateStatus);
router.put('/:id/service-report', validate({ ...id, body: v.serviceReportSchema }), c.saveServiceReport);
router.post('/:id/resolve', validate({ ...id, body: v.serviceReportSchema }), c.resolveComplaint);

// Notes and photos
router.post('/:id/notes', validate({ ...id, body: v.noteSchema }), c.addNote);
router.post(
  '/:id/photos',
  uploadLimiter,
  validate(id),
  photoUpload.array('photos', MAX_PHOTOS_PER_UPLOAD),
  validate({ body: v.photoUploadSchema }),
  c.uploadPhotos,
);
router.get('/:id/photos/:photoId', validate({ params: v.photoParamSchema }), c.getPhoto);

export default router;
