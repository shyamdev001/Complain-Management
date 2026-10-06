import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { Installer } from '../models/Installer';
import { User } from '../models/User';
import { UserRole } from '../types/enums';

/**
 * First-run setup: creates the two installer companies and the first office
 * login. Installers have no login - they receive an Excel sheet. Safe to run
 * again - it never overwrites an existing installer or account, and it
 * creates no customers or complaints.
 */
async function ensureInstaller(name: string) {
  return (await Installer.findOne({ name })) ?? (await Installer.create({ name }));
}

async function ensureUser(params: { name: string; email: string; password: string; role: UserRole; installer?: unknown }) {
  if (await User.findOne({ email: params.email })) {
    console.log(`[seed] ${params.email} already exists - left unchanged`);
    return;
  }
  await User.create({
    name: params.name,
    email: params.email,
    role: params.role,
    installer: params.installer,
    passwordHash: await bcrypt.hash(params.password, 12),
  });
  console.log(`[seed] created ${params.role} login: ${params.email}`);
}

async function seed() {
  await connectDatabase();

  await ensureInstaller('AP Enterprise');
  await ensureInstaller('Navia');

  await ensureUser({ name: 'Office Admin', email: env.seedAdminEmail, password: env.seedAdminPassword, role: UserRole.ADMIN });

  console.log('[seed] done. Passwords are the SEED_* values in server/.env - change them after first login.');
  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
