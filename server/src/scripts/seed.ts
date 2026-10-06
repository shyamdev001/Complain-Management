import { connectDatabase, disconnectDatabase } from '../config/db';
import { ensureFirstRunData } from '../services/bootstrap.service';

/** Runs the first-run setup by hand (the server also does this on every start). */
async function seed() {
  await connectDatabase();
  await ensureFirstRunData();
  console.log('[seed] done. The first login is the SEED_ADMIN_* values in server/.env - change the password after first login.');
  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
