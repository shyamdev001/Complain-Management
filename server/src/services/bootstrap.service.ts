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

  if (await User.exists({ role: UserRole.ADMIN })) return;

  // A hosted app must not come up with a password anyone can read in the repository.
  if (env.isProduction && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn('[setup] No office login exists. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, then restart.');
    return;
  }
  await User.create({
    name: 'Office Admin',
    email: env.seedAdminEmail,
    role: UserRole.ADMIN,
    passwordHash: await bcrypt.hash(env.seedAdminPassword, 12),
  });
  console.log(`[setup] created the first office login: ${env.seedAdminEmail}`);
}
