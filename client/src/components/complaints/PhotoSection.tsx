import * as React from 'react';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AuthedImage } from './AuthedImage';
import { Section } from './shared';
import { uploadPhotos } from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import { formatDate } from '@/lib/utils';
import type { Complaint, Photo, PhotoKind } from '@/types';

const MAX_PER_UPLOAD = 6;

export function PhotoGrid({
  complaintId,
  photos,
  onOpen,
}: {
  complaintId: string;
  photos: Photo[];
  onOpen: (photo: Photo) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onOpen(photo)}
          className="aspect-square overflow-hidden rounded-xl border border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${photo.kind.toLowerCase()} photo`}
        >
          <AuthedImage
            complaintId={complaintId}
            photoId={photo.id}
            alt={`${photo.kind.toLowerCase()} photo`}
            className="h-full w-full"
          />
        </button>
      ))}
    </div>
  );
}

export function PhotoLightbox({
  complaintId,
  photo,
  onClose,
}: {
  complaintId: string;
  photo: Photo | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(photo)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-4">
        {photo && (
          <>
            <DialogTitle className="pr-8 text-base capitalize">{photo.kind.toLowerCase()} photo</DialogTitle>
            <DialogDescription>
              Uploaded by {photo.uploadedByName} on {formatDate(photo.uploadedAt, true)}
            </DialogDescription>
            <AuthedImage
              complaintId={complaintId}
              photoId={photo.id}
              alt={`${photo.kind.toLowerCase()} photo`}
              className="max-h-[70vh] min-h-40 w-full rounded-xl !object-contain"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PhotoSection({
  complaint,
  canUpload,
  onChange,
}: {
  complaint: Complaint;
  canUpload: boolean;
  onChange: (c: Complaint) => void;
}) {
  const [uploading, setUploading] = React.useState<PhotoKind | null>(null);
  const [open, setOpen] = React.useState<Photo | null>(null);

  const onFiles = async (kind: PhotoKind, list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (files.length > MAX_PER_UPLOAD) {
      toast.error(`Upload up to ${MAX_PER_UPLOAD} photos at a time`);
      return;
    }
    setUploading(kind);
    try {
      onChange(await uploadPhotos(complaint.id, kind, files));
      toast.success(`${files.length} ${kind.toLowerCase()} photo${files.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Upload failed. Check your connection and try again.'));
    } finally {
      setUploading(null);
    }
  };

  return (
    <Section title="Service photos">
      <div className="grid gap-5 sm:grid-cols-2">
        {(['BEFORE', 'AFTER'] as PhotoKind[]).map((kind) => {
          const photos = complaint.photos.filter((p) => p.kind === kind);
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold capitalize">
                  {kind.toLowerCase()} <span className="font-normal text-muted-foreground">({photos.length})</span>
                </p>
                {canUpload && (
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary/10 px-3.5 text-xs font-semibold text-primary transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-primary/15">
                    {uploading === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {uploading === kind ? 'Uploading...' : 'Add photos'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        void onFiles(kind, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {photos.length ? (
                <PhotoGrid complaintId={complaint.id} photos={photos} onOpen={setOpen} />
              ) : (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  No {kind.toLowerCase()} photos yet
                </p>
              )}
            </div>
          );
        })}
      </div>
      <PhotoLightbox complaintId={complaint.id} photo={open} onClose={() => setOpen(null)} />
    </Section>
  );
}
