import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { listNotifications, markNotificationsRead } from '@/services/api';
import { cn, formatDate } from '@/lib/utils';
import type { AppNotification } from '@/types';

const POLL_MS = 60_000;

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);

  const load = React.useCallback(() => {
    listNotifications()
      .then((data) => {
        setItems(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const onOpenChange = (open: boolean) => {
    if (open && unread > 0) {
      markNotificationsRead()
        .then(() => setUnread(0))
        .catch(() => undefined);
    }
    // Keep unread highlighting while the menu is open; clear it once closed.
    if (!open) setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!user) return null;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-bold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>}
        {items.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => navigate(`/admin/complaints/${n.complaintId}`)}
            className="items-start gap-2.5"
          >
            <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
            <span className="min-w-0">
              <span className="block whitespace-normal text-sm font-medium leading-snug text-foreground">{n.message}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{formatDate(n.createdAt, true)}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
