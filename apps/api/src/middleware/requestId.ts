import type { RequestHandler } from 'express';
import { nanoid } from 'nanoid';

/** Attach a unique request ID (or honour an incoming one from a load balancer). */
export const requestId: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) || nanoid(21);
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};
