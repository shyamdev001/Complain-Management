import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // raw phone-camera ceiling; compressed before storage
export const MAX_PHOTOS_PER_UPLOAD = 6;

/** The filled-in Excel sheet an installer sends back. Small by nature - a few KB per complaint. */
export const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Browsers and WhatsApp downloads report varying MIME types for .xlsx, so go by the extension.
    if (!/\.xlsx$/i.test(file.originalname)) {
      cb(ApiError.badRequest('Upload the Excel sheet as an .xlsx file.'));
      return;
    }
    cb(null, true);
  },
});

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_PHOTOS_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(ApiError.badRequest('This file type is not supported. Please upload a JPG, PNG or WEBP photo.'));
      return;
    }
    cb(null, true);
  },
});
