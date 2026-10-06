import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { cloudinary, cloudinaryEnabled } from '../config/cloudinary';
import { env } from '../config/env';

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 82;

export interface StoredPhoto {
  storage: 'local' | 'cloudinary';
  key: string;
  mimeType: string;
  size: number;
}

/**
 * Auto-orients (EXIF), caps the longest edge and re-encodes to JPEG, so a
 * 10MB phone-camera original is stored as a few hundred KB.
 */
async function optimizePhoto(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

function localRoot(): string {
  return path.resolve(env.uploadDir);
}

/**
 * Stores a service photo privately. Cloudinary ("authenticated" delivery,
 * never publicly reachable) is used when its credentials are configured;
 * otherwise photos go to the server's disk. Either way the bytes are only
 * ever served back through the permission-checked photo endpoint.
 */
export async function savePhoto(buffer: Buffer, complaintNumber: string): Promise<StoredPhoto> {
  const optimized = await optimizePhoto(buffer);

  if (cloudinaryEnabled) {
    const publicId = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `solar-complaints/${complaintNumber.toLowerCase()}`,
          public_id: randomUUID(),
          resource_type: 'image',
          type: 'authenticated',
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve(result.public_id);
        },
      );
      stream.end(optimized);
    });
    return { storage: 'cloudinary', key: publicId, mimeType: 'image/jpeg', size: optimized.length };
  }

  const relativeKey = path.posix.join('complaints', complaintNumber, `${randomUUID()}.jpg`);
  const absolutePath = path.join(localRoot(), relativeKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, optimized);
  return { storage: 'local', key: relativeKey, mimeType: 'image/jpeg', size: optimized.length };
}

export async function readPhoto(photo: { storage: string; key: string }): Promise<Buffer> {
  if (photo.storage === 'cloudinary') {
    const url = cloudinary.url(photo.key, {
      resource_type: 'image',
      type: 'authenticated',
      sign_url: true,
      secure: true,
      format: 'jpg',
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch photo ${photo.key}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  const absolutePath = path.resolve(localRoot(), photo.key);
  if (!absolutePath.startsWith(localRoot() + path.sep)) throw new Error('Invalid photo path');
  return fs.readFile(absolutePath);
}
