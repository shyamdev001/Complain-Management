import * as React from 'react';
import { toast } from 'sonner';
import { KeyRound, Plus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import {
  createInstaller,
  createUser,
  listInstallers,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateInstaller,
} from '@/services/api';
import { getErrorMessage } from '@/lib/axios';
import type { AppUser, Installer } from '@/types';

const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter and a number';
const PASSWORD_PATTERN = '(?=.*[A-Z])(?=.*[0-9]).{8,}';

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password });
      toast.success('Login created');
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add office login</DialogTitle>
            <DialogDescription>For Solar Coop office staff. Every office login can see and do everything.</DialogDescription>
          </DialogHeader>
          <FormField label="Name" htmlFor="user-name" required>
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
          </FormField>
          <FormField label="Email (used to sign in)" htmlFor="user-email" required>
            <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Phone" htmlFor="user-phone">
            <Input
              id="user-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{10}"
              title="10-digit mobile number"
              maxLength={10}
            />
          </FormField>
          <FormField label="Password" htmlFor="user-password" required hint={PASSWORD_HINT}>
            <Input
              id="user-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_HINT}
              required
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create login
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setPassword(''), [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await resetUserPassword(user!.id, password);
      toast.success(`Password changed for ${user!.name}. They have been signed out everywhere.`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              For {user?.name} ({user?.email}).
            </DialogDescription>
          </DialogHeader>
          <FormField label="New password" htmlFor="reset-password" required hint={PASSWORD_HINT}>
            <Input
              id="reset-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              pattern={PASSWORD_PATTERN}
              title={PASSWORD_HINT}
              required
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { user: me } = useAuth();
  const [installers, setInstallers] = React.useState<Installer[] | null>(null);
  const [users, setUsers] = React.useState<AppUser[] | null>(null);
  const [addingUser, setAddingUser] = React.useState(false);
  const [resetting, setResetting] = React.useState<AppUser | null>(null);
  const [newInstaller, setNewInstaller] = React.useState('');
  const [addingInstaller, setAddingInstaller] = React.useState(false);

  const load = React.useCallback(() => {
    listInstallers().then(setInstallers).catch(() => setInstallers([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  React.useEffect(load, [load]);

  const addInstaller = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingInstaller(true);
    try {
      await createInstaller({ name: newInstaller.trim() });
      toast.success(`${newInstaller.trim()} added`);
      setNewInstaller('');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAddingInstaller(false);
    }
  };

  const toggleInstaller = async (installer: Installer) => {
    try {
      await updateInstaller(installer.id, { active: !installer.active });
      toast.success(installer.active ? `${installer.name} deactivated` : `${installer.name} activated`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const toggleUser = async (user: AppUser) => {
    try {
      await setUserStatus(user.id, user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      toast.success(user.status === 'ACTIVE' ? `${user.name} disabled` : `${user.name} enabled`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Installers & office logins"
        description="The installers you can assign complaints to, and the office staff who can sign in."
      />

      <h2 className="mb-1 text-lg">Installers</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Installers do not sign in. They receive their complaints as an Excel sheet. A deactivated installer can no longer
        be chosen for new complaints.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {!installers && <Skeleton className="h-20" />}
        {installers?.map((installer) => (
          <Card key={installer.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <p className="font-bold">{installer.name}</p>
              <div className="flex items-center gap-2">
                <Badge variant={installer.active ? 'success' : 'secondary'}>{installer.active ? 'Active' : 'Inactive'}</Badge>
                <Button variant="outline" size="sm" onClick={() => toggleInstaller(installer)}>
                  {installer.active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <form onSubmit={addInstaller} className="mt-3 flex max-w-md items-center gap-2">
        <Input
          aria-label="New installer name"
          placeholder="Add another installer"
          className="h-10 text-sm"
          value={newInstaller}
          onChange={(e) => setNewInstaller(e.target.value)}
          minLength={2}
          maxLength={120}
        />
        <Button type="submit" variant="soft" loading={addingInstaller} disabled={newInstaller.trim().length < 2}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-lg">Office logins</h2>
        <Button onClick={() => setAddingUser(true)}>
          <UserPlus className="h-4 w-4" />
          Add office login
        </Button>
      </div>
      {!users ? (
        <Skeleton className="h-56" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-semibold">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.status === 'ACTIVE' ? 'success' : 'secondary'}>
                    {user.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setResetting(user)}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Set password
                    </Button>
                    {user.id !== me?.id && (
                      <Button variant="outline" size="sm" onClick={() => toggleUser(user)}>
                        {user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddUserDialog open={addingUser} onOpenChange={setAddingUser} onCreated={load} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
