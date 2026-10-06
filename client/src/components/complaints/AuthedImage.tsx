import * as React from 'react';
import { ImageOff } from 'lucide-react';
import { fetchPhotoBlob } from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Shows a private service photo. There is no public URL for these - the bytes
 * are fetched with the session (so the server can check who is asking) and
 * displayed from a temporary object URL.
 */
export function AuthedImage({
  complaintId,
  photoId,
  alt,
  className,
}: {
  complaintId: string;
  photoId: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    fetchPhotoBlob(complaintId, photoId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [complaintId, photoId]);

  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-secondary text-muted-foreground', className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  if (!src) return <Skeleton className={className} />;
  return <img src={src} alt={alt} className={cn('object-cover', className)} />;
}
