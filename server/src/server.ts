import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/db';
import { startOverdueSweep } from './services/overdue.service';
import { ensureFirstRunData } from './services/bootstrap.service';

async function bootstrap() {
  await connectDatabase();
  await ensureFirstRunData();

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });

  const sweep = startOverdueSweep();

  const shutdown = (signal: string) => {
    console.log(`[server] received ${signal}, shutting down gracefully...`);
    clearInterval(sweep);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
