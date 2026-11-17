import 'dotenv/config';
import { loadConfig } from './server/config.ts';
import { prisma } from './server/db.ts';
import { createApp } from './server/app.ts';
import { createImageStorage } from './server/storage.ts';
import { attachFrontend } from './server/frontend.ts';
import { errorHandler } from './server/errors.ts';
import { startUploadMaintenance } from './server/uploads.ts';

async function startServer() {
  const config = loadConfig();
  await prisma.$queryRaw`SELECT 1`;
  const storage = createImageStorage(config);
  const app = createApp({ prisma, config, storage });
  const closeFrontend = await attachFrontend(app, config);
  app.use(errorHandler);
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`GraspIt running on port ${config.port} (${config.nodeEnv}, payments: ${config.paymentsMode})`));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  const closeMaintenance = startUploadMaintenance(prisma, config.databaseSchema, storage);
  const shutdown = () => {
    const deadline = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      try { await closeMaintenance(); await closeFrontend(); await prisma.$disconnect(); clearTimeout(deadline); process.exit(0); }
      catch { process.exit(1); }
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
startServer().catch(async (err) => {
  console.error('Failed to start GraspIt:', err instanceof Error ? err.message : 'Unknown startup error.');
  await prisma.$disconnect();
  process.exitCode = 1;
});
