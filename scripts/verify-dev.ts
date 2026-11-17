// Smoke-test the real Vite middleware and development CSP without seeding data.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import { createImageStorage } from '../server/storage.ts';
import { attachFrontend } from '../server/frontend.ts';
import { errorHandler } from '../server/errors.ts';

const config = loadConfig({ ...process.env, NODE_ENV: 'development' });
const app = createApp({ prisma, config, storage: createImageStorage(config) });
// This HTTP/CSP smoke check must not compete with a developer's HMR socket.
const previousHmr = process.env.DISABLE_HMR;
process.env.DISABLE_HMR = 'true';
const closeFrontend = await attachFrontend(app, config);
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
try {
  const html = await fetch(base);
  assert.equal(html.status, 200);
  const csp = html.headers.get('content-security-policy')!;
  assert(csp.includes("script-src 'self' 'unsafe-inline'"));
  assert(csp.includes('ws:')); assert(!csp.includes('unsafe-eval'));
  assert((await html.text()).includes('/@vite/client'));
  for (const route of ['/@vite/client', '/src/main.tsx']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type')!, /javascript/);
    await response.text();
  }
  const image = await fetch(`${base}/images/course_ai_systems_1794504816295.jpg`);
  assert.equal(image.status, 200); assert.match(image.headers.get('content-type')!, /image\/jpeg/);
  await image.arrayBuffer();
  console.log('PASS development frontend, Vite client, TSX transformation, static images and development CSP. No database writes.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeFrontend();
  if (previousHmr === undefined) delete process.env.DISABLE_HMR;
  else process.env.DISABLE_HMR = previousHmr;
  await prisma.$disconnect();
}
