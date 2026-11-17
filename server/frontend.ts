import express, { type Express } from 'express';
import path from 'node:path';
import type { AppConfig } from './config.ts';

export async function attachFrontend(app: Express, config: AppConfig): Promise<() => Promise<void>> {
  if (config.nodeEnv === 'development') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**'] }, hmr: process.env.DISABLE_HMR !== 'true', ws: process.env.DISABLE_HMR === 'true' ? false : undefined, watch: process.env.DISABLE_HMR === 'true' ? null : {} }, appType: 'spa' });
    app.use(vite.middlewares);
    return () => vite.close();
  }
  const dist = path.resolve('dist');
  app.use(express.static(dist, { maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  return async () => {};
}
