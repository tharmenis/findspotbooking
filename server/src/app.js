// Assembles the Express app. Route registration order matters (04-widget-embedding.md):
// static/known paths must be mounted before the /:publicId catch-all.
//
//   1. Body parser + security headers
//   2. /embed.js, /widget.v4.js, /widget.css, /standalone.js
//   3. /api/*  (resolvePublicId -> originGate -> standaloneGate per sub-route)
//   4. /internal/* (internalAuth only — WordPress calling Express)
//   5. /:publicId catch-all (last)
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import assets from './routes/assets.js';
import api from './routes/api/index.js';
import sync from './routes/internal/sync.js';
import standalone from './routes/standalone.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // 1. Body parser + security headers
  app.use(express.json({ limit: config.maxBodyBytes }));
  app.use(
    helmet({
      // Listing logos are served from the WP site (logoUrl set per-listing
      // in the WordPress admin). The default Helmet img-src is 'self' data:,
      // which blocks remote logos. Allow the WP host while keeping the rest
      // of the default policy intact.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', config.wpBaseUrl],
        },
      },
    }),
  );

  // morgan writes to the same structured logger
  app.use(morgan('combined', { stream: { write: (line) => logger.info(line.trim()) } }));

  // 2. Static widget assets
  app.use(assets);

  // 3. /api/*
  app.use('/api', api);

  // 4. /internal/* — WordPress's sync webhook
  app.use('/internal', sync);

  // 5. Standalone catch-all
  app.use(standalone);

  app.use(errorHandler);

  return app;
}
