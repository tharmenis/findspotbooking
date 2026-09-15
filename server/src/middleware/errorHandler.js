// Final error-formatting middleware. Registered after all routes so any error
// (sync, body-parser, upstream) is normalized into the same
// { error: { code, message } } shape the widget can branch on.
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { WordPressError } from '../services/wordpressClient.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof WordPressError) {
    return res.status(err.status || 502).json({
      error: { code: err.code || 'upstream_error', message: err.message },
    });
  }

  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({
      error: { code: 'invalid_body', message: 'Malformed request body.' },
    });
  }

  logger.error('unhandled error', err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    return res.status(status).json({
      error: { code: 'internal', message: 'Something went wrong.' },
    });
  }

  return res.status(status).json({
    error: { code: err.code || 'error', message: err.message || 'Request failed.' },
  });
}
