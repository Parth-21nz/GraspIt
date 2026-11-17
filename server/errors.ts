import type { ErrorRequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) { next(err); return; }
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err?.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large.' }); return; }
  if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON.' }); return; }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const status = ({ P2002: 409, P2003: 409, P2025: 404, P2028: 503 } as Record<string, number>)[err.code];
    if (status) { res.status(status).json({ error: status === 409 ? 'This change conflicts with an existing record.' : status === 404 ? 'Record not found.' : 'The database is busy. Please retry.' }); return; }
  }
  // Prisma errors may embed input data. Log the error class only.
  console.error('Unhandled request error:', err instanceof Error ? err.name : 'UnknownError');
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
