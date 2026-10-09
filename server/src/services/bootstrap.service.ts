import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { Installer } from '../models/Installer';
import { User } from '../models/User';
import { UserRole } from '../types/enums';

const DEFAULT_INSTALLERS = ['AP Enterprise', 'Navia'];

/**
 * First-run setup: the two installer companies and the first office login.
 * Never overwrites an existing installer or account, and creates no customers
 * or complaints, so it is safe to run on every start.
 */
export async function ensureFirstRunData(): Promise<void> {
  for (const name of DEFAULT_INSTALLERS) {
    if (!(await Installer.findOne({ name }))) {
      await Installer.create({ name });
      console.log(`[setup] created installer: ${name}`);
    }
  }

  // Databases created before the super admin role existed: the first office login becomes the super admin.
  if (!(await User.exists({ role: UserRole.SUPER_ADMIN }))) {
    const first =
      (await User.findOne({ role: UserRole.ADMIN, email: env.seedAdminEmail.toLowerCase() })) ??
      (await User.findOne({ role: UserRole.ADMIN }).sort({ createdAt: 1 }));
    if (first) {
      first.role = UserRole.SUPER_ADMIN;
      await first.save();
      console.log(`[setup] ${first.email} is now the super admin`);
    }
  }
  if (await User.exists({ role: UserRole.SUPER_ADMIN })) return;

  // There is deliberately no built-in password: the first login only exists once someone has chosen one.
  if (env.seedAdminPassword.length < 8) {
    console.warn('[setup] No login exists yet. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters), then restart.');
    return;
  }
  await User.create({
    name: 'Super Admin',
    email: env.seedAdminEmail,
    role: UserRole.SUPER_ADMIN,
    passwordHash: await bcrypt.hash(env.seedAdminPassword, 12),
  });
  console.log(`[setup] created the super admin login: ${env.seedAdminEmail}`);
}
