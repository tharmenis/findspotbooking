// Entrypoint: creates the app and calls .listen(). Kept separate from
// app.js so tests can build the app without binding a port.
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(config.port, () => {
  logger.info(`findspot booking engine listening on :${config.port} (${config.env})`);
});
