import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

/** Structured JSON request log — replaces Morgan. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
      requestId: req.id,
    });
  });
  next();
};
